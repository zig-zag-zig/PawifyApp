import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response, NextFunction } from 'express';
import { asyncHandler, publicHandler } from '../../../src/common/http/handlers.js';

describe('asyncHandler', () => {
    it('calls the wrapped handler with req, res, next', async () => {
        let handlerCalled = false;
        const handler = asyncHandler(async (req, res, next) => {
            handlerCalled = true;
            res.status(200).send('ok');
        });

        const req = {} as Request;
        const res = { status: () => res, send: () => {} } as any;
        const next = () => {};

        await handler(req, res, next);
        assert.equal(handlerCalled, true);
    });

    it('catches async errors and forwards to next', async () => {
        const nextErrors: Error[] = [];
        const handler = asyncHandler(async () => {
            throw new Error('async failure');
        });

        await handler(
            {} as Request,
            {} as Response,
            ((error: any) => {
                nextErrors.push(error);
            }) as NextFunction,
        );

        assert.equal(nextErrors.length, 1);
        assert.equal(nextErrors[0]!.message, 'async failure');
    });

    it('handles synchronous handler that returns void', () => {
        let called = false;
        const handler = asyncHandler((_req, _res, _next) => {
            called = true;
        });

        handler({} as Request, {} as Response, () => {});
        assert.equal(called, true);
    });
});

describe('publicHandler', () => {
    it('sets x-request-id header and calls the wrapped handler', async () => {
        let handlerCalled = false;
        const setHeaderCalls: Array<[string, string]> = [];

        const handler = publicHandler('testEndpoint', async () => {
            handlerCalled = true;
        });

        const req = {
            method: 'GET',
            originalUrl: '/v1/test',
            header: () => '',
        } as unknown as Request;

        const res = {
            statusCode: 200,
            locals: {},
            setHeader: (name: string, value: string) => {
                setHeaderCalls.push([name, value]);
            },
            status: function () {
                return this;
            },
            send: () => {},
            json: () => {},
        } as unknown as Response;

        await handler(req, res, () => {});

        assert.equal(handlerCalled, true);
        const requestIdHeader = setHeaderCalls.find(([name]) => name === 'x-request-id');
        assert.ok(requestIdHeader);
        assert.ok(requestIdHeader[1].length > 0);
    });
});
