import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    HttpError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    toHttpError,
} from '../src/common/http/errors.js';

describe('HttpError', () => {
    it('stores statusCode, message, and expose flag', () => {
        const error = new HttpError(422, 'Unprocessable', false);
        assert.equal(error.statusCode, 422);
        assert.equal(error.message, 'Unprocessable');
        assert.equal(error.expose, false);
        assert.equal(error.name, 'HttpError');
    });

    it('defaults expose to true', () => {
        const error = new HttpError(400, 'Bad request');
        assert.equal(error.expose, true);
    });
});

describe('HttpError subclasses', () => {
    it('BadRequestError uses status 400', () => {
        const error = new BadRequestError('Invalid input');
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, 'Invalid input');
        assert.equal(error.expose, true);
    });

    it('UnauthorizedError uses status 401 with default message', () => {
        const error = new UnauthorizedError();
        assert.equal(error.statusCode, 401);
        assert.equal(error.message, 'User is not authenticated.');
    });

    it('ForbiddenError uses status 403', () => {
        const error = new ForbiddenError('No access');
        assert.equal(error.statusCode, 403);
        assert.equal(error.message, 'No access');
    });

    it('NotFoundError uses status 404', () => {
        const error = new NotFoundError('Not found');
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, 'Not found');
    });
});

describe('toHttpError', () => {
    it('returns the HttpError instance as-is', () => {
        const original = new BadRequestError('test');
        assert.equal(toHttpError(original), original);
    });

    it('wraps an unknown error as a 500 with expose: false', () => {
        const result = toHttpError(new Error('something broke'));
        assert.equal(result.statusCode, 500);
        assert.equal(result.message, 'Internal server error.');
        assert.equal(result.expose, false);
    });

    it('wraps a non-Error value as a 500', () => {
        const result = toHttpError('string error');
        assert.equal(result.statusCode, 500);
        assert.equal(result.expose, false);
    });
});
