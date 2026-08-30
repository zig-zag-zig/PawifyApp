import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { Request, Response, NextFunction } from 'express';
import { HttpError, BadRequestError } from '../src/common/http/errors.js';
import { errorMiddleware } from '../src/common/http/errorMiddleware.js';

const createMockReq = (method = 'GET', originalUrl = '/test'): Partial<Request> => ({
    method,
    originalUrl,
});

const createMockRes = (
    headersSent = false,
): Partial<Response> & { _status?: number; _body?: unknown } => {
    const res: Partial<Response> & { _status?: number; _body?: unknown } = {
        headersSent,
        status(code: number) {
            res._status = code;
            return res as any;
        },
        json(body: unknown) {
            res._body = body;
            return res as any;
        },
    };
    return res;
};

describe('errorMiddleware', () => {
    it('returns the HttpError message when expose is true', () => {
        const error = new BadRequestError('Invalid input');
        const req = createMockReq();
        const res = createMockRes();
        const next = mock.fn();

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(res._status, 400);
        assert.deepEqual(res._body, {
            message: 'Invalid input',
            statusCode: 400,
        });
    });

    it('returns generic message when expose is false', () => {
        const error = new HttpError(500, 'Internal server error.', false);
        const req = createMockReq();
        const res = createMockRes();
        const next = mock.fn();

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(res._status, 500);
        assert.deepEqual(res._body, {
            message: 'Internal server error.',
            statusCode: 500,
        });
    });

    it('wraps unknown errors as 500 with generic message', () => {
        const error = new Error('something broke');
        const req = createMockReq();
        const res = createMockRes();
        const next = mock.fn();

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(res._status, 500);
        assert.deepEqual(res._body, {
            message: 'Internal server error.',
            statusCode: 500,
        });
    });

    it('delegates to next when headers are already sent', () => {
        const error = new BadRequestError('too late');
        const req = createMockReq();
        const res = createMockRes(true);
        const next = mock.fn();

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(next.mock.callCount(), 1);
        assert.deepEqual(next.mock.calls[0]!.arguments, [error]);
        assert.equal(res._status, undefined);
    });

    it('includes requestId from res.locals in error-level logs', () => {
        const error = new Error('something broke');
        const req = createMockReq();
        const res = createMockRes() as any;
        res.locals = { requestId: 'req-123' };
        const next = mock.fn();
        const lines: string[] = [];
        mock.method(console, 'error', (line: string) => {
            lines.push(line);
        });

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(res._status, 500);
        assert.equal(lines.length, 1);
        const log = JSON.parse(lines[0]!) as Record<string, unknown>;
        assert.equal(log.requestId, 'req-123');
        assert.equal(log.statusCode, 500);
        assert.equal(log.method, 'GET');
    });

    it('omits requestId from logs when res.locals has none', () => {
        const error = new Error('something broke');
        const req = createMockReq();
        const res = createMockRes() as any;
        res.locals = {};
        const next = mock.fn();
        const lines: string[] = [];
        mock.method(console, 'error', (line: string) => {
            lines.push(line);
        });

        errorMiddleware(error, req as Request, res as Response, next as NextFunction);

        assert.equal(lines.length, 1);
        const log = JSON.parse(lines[0]!) as Record<string, unknown>;
        assert.equal(log.requestId, undefined);
    });
});
