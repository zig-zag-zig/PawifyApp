import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';

// Debug-level logs are asserted below, so enable them before any module that
// reads loggingConfig is loaded (each test file runs in its own process).
process.env.LOG_LEVEL = 'debug';

import { BadRequestError } from '../../../src/common/http/errors.js';

const createReq = (): Request =>
    ({
        method: 'GET',
        originalUrl: '/v1/test',
        header: (name: string) => (name === 'x-request-id' ? 'client-req-1' : ''),
    }) as unknown as Request;

const createRes = (): Response & { locals: Record<string, unknown> } =>
    ({
        locals: {},
        statusCode: 200,
        setHeader() {},
    }) as unknown as Response & { locals: Record<string, unknown> };

const parseLogs = (lines: string[]): Array<Record<string, unknown>> =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('runHttpRequestScope', () => {
    it('stashes the request id on res.locals and sets the response header', async () => {
        const { runHttpRequestScope } = await import('../../../src/common/http/requestScope.js');
        const { createLogger } = await import('../../../src/common/logging/logger.js');
        const req = createReq();
        const res = createRes();
        let handlerCalled = false;

        await runHttpRequestScope({
            endpointName: 'testEndpoint',
            handler: async () => {
                handlerCalled = true;
            },
            logger: createLogger('test'),
            requestKind: 'public',
            req,
            res,
        });

        assert.equal(handlerCalled, true);
        assert.equal(res.locals.requestId, 'client-req-1');
    });

    it('logs handler failures with request context at error level and rethrows', async () => {
        const { runHttpRequestScope } = await import('../../../src/common/http/requestScope.js');
        const { createLogger } = await import('../../../src/common/logging/logger.js');
        const lines: string[] = [];
        mock.method(console, 'error', (line: string) => {
            lines.push(line);
        });

        const req = createReq();
        const res = createRes();
        const failure = new Error('handler exploded');

        await assert.rejects(
            () =>
                runHttpRequestScope({
                    endpointName: 'testEndpoint',
                    handler: async () => {
                        throw failure;
                    },
                    logger: createLogger('test'),
                    requestKind: 'public',
                    req,
                    res,
                }),
            (error) => error === failure,
        );

        assert.equal(lines.length, 1);
        const log = JSON.parse(lines[0]!) as Record<string, unknown>;
        assert.equal(log.level, 'error');
        assert.equal(log.requestId, 'client-req-1');
        assert.equal(log.endpoint, 'testEndpoint');
        assert.equal(log.statusCode, 500);
        assert.equal(res.locals.requestId, 'client-req-1');
    });

    it('logs client errors at debug level', async () => {
        const { runHttpRequestScope } = await import('../../../src/common/http/requestScope.js');
        const { createLogger } = await import('../../../src/common/logging/logger.js');
        const lines: string[] = [];
        mock.method(console, 'log', (line: string) => {
            lines.push(line);
        });

        const req = createReq();
        const res = createRes();
        const badRequest = new BadRequestError('bad input');

        await assert.rejects(
            () =>
                runHttpRequestScope({
                    endpointName: 'testEndpoint',
                    handler: async () => {
                        throw badRequest;
                    },
                    logger: createLogger('test'),
                    requestKind: 'public',
                    req,
                    res,
                }),
            (error) => error === badRequest,
        );

        const logs = parseLogs(lines);
        const failedLog = logs.find((log) => log.message === 'public request failed');
        assert.ok(failedLog);
        assert.equal(failedLog.level, 'debug');
        assert.equal(failedLog.requestId, 'client-req-1');
        assert.equal(failedLog.statusCode, 400);
    });

    it('keeps request-completion debug logging working', async () => {
        const { runHttpRequestScope } = await import('../../../src/common/http/requestScope.js');
        const { createLogger } = await import('../../../src/common/logging/logger.js');
        const lines: string[] = [];
        mock.method(console, 'log', (line: string) => {
            lines.push(line);
        });

        const req = createReq();
        const res = createRes();

        await runHttpRequestScope({
            endpointName: 'testEndpoint',
            handler: async () => {},
            logger: createLogger('test'),
            requestKind: 'public',
            req,
            res,
        });

        const logs = parseLogs(lines);
        assert.ok(logs.some((log) => log.message === 'public request started'));
        const completedLog = logs.find((log) => log.message === 'public request completed');
        assert.ok(completedLog);
        assert.equal(completedLog.level, 'debug');
        assert.equal(completedLog.requestId, 'client-req-1');
        assert.equal(completedLog.statusCode, 200);
    });
});
