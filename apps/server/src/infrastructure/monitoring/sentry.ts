import type { Express } from 'express';
import * as Sentry from '@sentry/node';
import { monitoringConfig } from '../../config/runtimeConfig.js';

let initialized = false;

type ErrorWithStatus = Error & {
    status?: number | string;
    statusCode?: number | string;
    status_code?: number | string;
    output?: {
        statusCode?: number | string;
    };
};

const sensitiveHeaders = new Set(['authorization', 'cookie', 'x-api-key', 'x-firebase-appcheck']);

const parseStatusCode = (error: ErrorWithStatus): number => {
    const rawStatus =
        error.statusCode ?? error.status ?? error.status_code ?? error.output?.statusCode;
    const parsed = Number.parseInt(String(rawStatus ?? 500), 10);
    return Number.isFinite(parsed) ? parsed : 500;
};

const sanitizeEvent: NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend'] = (event) => {
    if (event.request?.headers) {
        Object.keys(event.request.headers).forEach((key) => {
            if (sensitiveHeaders.has(key.toLowerCase())) {
                delete event.request?.headers?.[key];
            }
        });
    }

    if (event.request) {
        delete event.request.cookies;
    }

    delete event.user;
    return event;
};

export const initErrorMonitoring = (): void => {
    if (initialized || !monitoringConfig.sentryEnabled || !monitoringConfig.sentryDsn) {
        return;
    }

    const options: Parameters<typeof Sentry.init>[0] = {
        dsn: monitoringConfig.sentryDsn,
        environment: monitoringConfig.sentryEnvironment,
        release: monitoringConfig.sentryRelease,
        sendDefaultPii: false,
        maxBreadcrumbs: 50,
        beforeSend: sanitizeEvent,
        initialScope: {
            tags: {
                service: 'pawifyapi',
                app_env: monitoringConfig.appEnv,
                runtime: 'node',
            },
        },
    };

    if (monitoringConfig.sentryTracesSampleRate > 0) {
        options.tracesSampleRate = monitoringConfig.sentryTracesSampleRate;
    }

    Sentry.init(options);
    initialized = true;
};

export const setupExpressErrorMonitoring = (app: Express): void => {
    if (!initialized) {
        return;
    }

    Sentry.setupExpressErrorHandler(app, {
        shouldHandleError: (error) => parseStatusCode(error) >= 500,
    });
};

export const captureError = (error: unknown, context?: Record<string, unknown>): void => {
    if (!initialized) {
        return;
    }

    Sentry.withScope((scope) => {
        if (context) {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
        }

        Sentry.captureException(error);
    });
};

export const flushErrorMonitoring = async (timeoutMs = 2000): Promise<boolean> => {
    if (!initialized) {
        return true;
    }

    return Sentry.flush(timeoutMs);
};

initErrorMonitoring();
