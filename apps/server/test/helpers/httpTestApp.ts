import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Router } from 'express';
import express from 'express';
import { errorMiddleware } from '../../src/common/http/errorMiddleware.js';
import {
    installFirebaseFakes,
    installFirebaseStoreFakes,
    installDaprFakes,
    installSentryFakes,
    installAccountServiceFakes,
    installFirebaseTypesFake,
    installPushTokenAdapterFake,
} from './moduleFakes.js';

type FakeCheckAuth = (req: { headers: { authorization?: string } }) => Promise<string>;

let fakeCheckAuth: FakeCheckAuth = async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
    }
    return 'test-user-id';
};

export const setFakeCheckAuth = (fn: FakeCheckAuth): void => {
    fakeCheckAuth = fn;
};

export const installAllFakes = (): void => {
    installFirebaseFakes();
    installFirebaseStoreFakes();
    installDaprFakes();
    installSentryFakes();
    installAccountServiceFakes(fakeCheckAuth);
    installFirebaseTypesFake();
    installPushTokenAdapterFake();
};

/**
 * Creates an Express app with JSON parsing, the given router mounted at /v1,
 * and the error middleware. Starts it and returns the base URL.
 *
 * Removes the boilerplate that was duplicated across all integration test files.
 */
export const createIntegrationTestApp = async (router: Router): Promise<string> => {
    const app = express();
    app.use(express.json());
    app.use('/v1', router);
    app.use(errorMiddleware);

    return startTestServer(app);
};

let testServers: Server[] = [];

const closeServer = async (server: Server): Promise<void> => {
    // Drop keep-alive sockets so close() can finish promptly in Node 22+.
    server.closeAllConnections?.();
    server.closeIdleConnections?.();

    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
};

export const startTestServer = async (app?: express.Express): Promise<string> => {
    const testApp = app ?? express();
    const listener = await new Promise<Server>((resolve, reject) => {
        const instance = testApp.listen(0, '127.0.0.1', (error?: Error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(instance);
        });
    });
    testServers.push(listener);

    const address = listener.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
};

export const stopTestServer = async (): Promise<void> => {
    if (testServers.length === 0) {
        return;
    }

    const servers = testServers;
    testServers = [];
    await Promise.all(servers.map((server) => closeServer(server)));
};
