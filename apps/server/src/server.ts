import type { Express } from 'express';
import { createLogger } from './common/logging/logger.js';
import { serverConfig } from './config/runtimeConfig.js';
import { captureError, flushErrorMonitoring } from './infrastructure/monitoring/sentry.js';

const logger = createLogger('server');

/** How long to wait for in-flight requests to drain after SIGTERM/SIGINT. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000;

/** Flush error monitoring before exiting so Sentry never loses events on the way out. */
const exitAfterMonitoringFlush = (code: number): void => {
    void flushErrorMonitoring().finally(() => {
        process.exit(code);
    });
};

export const startServer = (app: Express): void => {
    const server = app.listen(serverConfig.port, () => {
        logger.info('server started', { port: serverConfig.port });
    });

    server.on('error', (error) => {
        logger.error('server listen error', { error });
        captureError(error, { source: 'server.listen' });
        exitAfterMonitoringFlush(1);
    });

    let shuttingDown = false;

    const shutdown = (signal: NodeJS.Signals): void => {
        if (shuttingDown) {
            // A second SIGTERM/SIGINT during the drain must not re-run shutdown.
            logger.info('shutdown already in progress, ignoring repeated signal', { signal });
            return;
        }
        shuttingDown = true;
        logger.info('shutting down gracefully', { signal });

        // Stop accepting new connections; in-flight requests drain naturally.
        server.close(() => {
            clearTimeout(drainTimer);
            logger.info('shutdown drain complete');
            exitAfterMonitoringFlush(0);
        });
        // Node 22's close() already drops idle keep-alive connections, so only
        // connections with in-flight requests keep the drain open.
        server.closeIdleConnections();

        // Backstop: if in-flight requests outlive the drain window, force-exit —
        // but still flush error monitoring on the way out.
        const drainTimer = setTimeout(() => {
            logger.error('shutdown drain timed out, exiting', {
                timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS,
            });
            exitAfterMonitoringFlush(1);
        }, SHUTDOWN_DRAIN_TIMEOUT_MS);
        drainTimer.unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { reason });
    captureError(reason, { source: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error });
    captureError(error, { source: 'uncaughtException' });
    exitAfterMonitoringFlush(1);
});
