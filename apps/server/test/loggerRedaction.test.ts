import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createLogger } from '../src/common/logging/logger.js';

const captureConsoleLog = (): string[] => {
    const lines: string[] = [];
    mock.method(console, 'log', (line: string) => {
        lines.push(line);
    });
    return lines;
};

const parseLastLog = (lines: string[]): Record<string, unknown> => {
    return JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
};

describe('logger redaction', () => {
    it('redacts sensitive field keys', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');

        logger.info('test message', {
            authorization: 'Bearer secret-token',
            cookie: 'session=abc123',
            password: 'hunter2',
            secret: 'my-secret',
            token: 'jwt-token',
            otp: '123456',
            email: 'user@example.com',
            userId: 'user-123',
        });

        const log = parseLastLog(lines);
        assert.equal(log.authorization, '[redacted]');
        assert.equal(log.cookie, '[redacted]');
        assert.equal(log.password, '[redacted]');
        assert.equal(log.secret, '[redacted]');
        assert.equal(log.token, '[redacted]');
        assert.equal(log.otp, '[redacted]');
        assert.equal(log.email, '[redacted]');
        assert.equal(log.userId, '[redacted]');
    });

    it('passes through non-sensitive keys', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');

        logger.info('test message', {
            method: 'GET',
            path: '/v1/health',
            statusCode: 200,
        });

        const log = parseLastLog(lines);
        assert.equal(log.method, 'GET');
        assert.equal(log.path, '/v1/health');
        assert.equal(log.statusCode, 200);
    });

    it('redacts sensitive keys in nested objects', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');

        logger.info('test', {
            request: {
                headers: {
                    authorization: 'Bearer secret',
                },
            },
        });

        const log = parseLastLog(lines);
        const request = log.request as Record<string, unknown>;
        const headers = request.headers as Record<string, unknown>;
        assert.equal(headers.authorization, '[redacted]');
    });

    it('serializes Error objects into name/message', () => {
        const lines: string[] = [];
        mock.method(console, 'error', (line: string) => {
            lines.push(line);
        });
        const logger = createLogger('test');

        logger.error('failure', { error: new Error('boom') });

        const log = parseLastLog(lines);
        const errorObj = log.error as Record<string, unknown>;
        assert.equal(errorObj.name, 'Error');
        assert.equal(errorObj.message, 'boom');
    });

    it('redacts sensitive keys entirely even when value is an array', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');

        logger.info('test', { userId: ['user-1', 'user-2'] });

        const log = parseLastLog(lines);
        // The key matches the redaction pattern, so the entire value is replaced
        assert.equal(log.userId, '[redacted]');
    });

    it('child logger preserves redaction behavior', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');
        const child = logger.child('sub');

        child.info('child message', { token: 'jwt-token', path: '/v1/test' });

        const log = parseLastLog(lines);
        assert.equal(log.token, '[redacted]');
        assert.equal(log.path, '/v1/test');
        assert.equal(log.scope, 'test.sub');
    });

    it('serializes bigint values in metadata', () => {
        const lines = captureConsoleLog();
        const logger = createLogger('test');

        logger.info('bigint test', { count: BigInt(42), name: 'test' });

        const log = parseLastLog(lines);
        assert.equal(log.count, '42');
        assert.equal(log.name, 'test');
    });

    it('respects log level filtering (debug suppressed at info)', () => {
        const lines: string[] = [];
        const originalLevel = process.env.LOG_LEVEL;
        try {
            process.env.LOG_LEVEL = 'info';
            mock.method(console, 'log', (line: string) => {
                lines.push(line);
            });

            const logger = createLogger('test');
            logger.debug('should not appear');

            assert.equal(lines.length, 0);
        } finally {
            process.env.LOG_LEVEL = originalLevel;
        }
    });
});
