import { describe, expect, it } from 'vitest';
import {
    createApiCallError,
    createNetworkApiCallError,
    isApiCallError,
    getUserFacingErrorMessage,
} from './apiErrors';

describe('createApiCallError', () => {
    it('creates error with 401 status', () => {
        const error = createApiCallError(401, '');
        expect(error.statusCode).toBe(401);
        expect(error.userMessage).toBe('Please sign in again.');
    });

    it('creates error with 403 status', () => {
        const error = createApiCallError(403, '');
        expect(error.userMessage).toBe('You do not have permission to do that.');
    });

    it('creates error with 404 status', () => {
        const error = createApiCallError(404, '');
        expect(error.userMessage).toBe('The requested item was not found.');
    });

    it('uses generic message for 500+ errors', () => {
        const error = createApiCallError(500, '{"error":"internal database failure"}');
        expect(error.userMessage).toBe('Something went wrong. Please try again.');
        // Server details should NOT leak
        expect(error.userMessage).not.toContain('database');
    });

    it('uses generic message for 502', () => {
        const error = createApiCallError(502, 'bad gateway details');
        expect(error.userMessage).toBe('Something went wrong. Please try again.');
    });

    it('extracts message from JSON body with "message" key', () => {
        const error = createApiCallError(400, '{"message":"Invalid artist ID"}');
        expect(error.userMessage).toBe('Invalid artist ID');
    });

    it('extracts message from JSON body with "error" key', () => {
        const error = createApiCallError(400, '{"error":"Bad request"}');
        expect(error.userMessage).toBe('Bad request');
    });

    it('extracts message from nested error.message', () => {
        const error = createApiCallError(400, '{"error":{"message":"Nested error"}}');
        expect(error.userMessage).toBe('Nested error');
    });

    it('uses plain text body as message for non-500 errors', () => {
        const error = createApiCallError(400, 'plain text error');
        expect(error.userMessage).toBe('plain text error');
    });

    it('falls back to status-based message for empty body', () => {
        const error = createApiCallError(400, '');
        expect(error.userMessage).toBe('Request failed (400). Please try again.');
    });

    it('sets responseData from parsed JSON', () => {
        const error = createApiCallError(400, '{"message":"test"}');
        expect(error.responseData).toEqual({ message: 'test' });
    });

    it('sets responseBody', () => {
        const body = '{"message":"test"}';
        const error = createApiCallError(400, body);
        expect(error.responseBody).toBe(body);
    });

    it('sets name to ApiCallError', () => {
        const error = createApiCallError(400, '');
        expect(error.name).toBe('ApiCallError');
    });

    it('is an instance of Error', () => {
        const error = createApiCallError(400, '');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('createNetworkApiCallError', () => {
    it('creates network error with correct message', () => {
        const error = createNetworkApiCallError(new Error('timeout'));
        expect(error.userMessage).toBe('Network request failed. Check your connection and try again.');
    });

    it('preserves cause', () => {
        const cause = new Error('timeout');
        const error = createNetworkApiCallError(cause);
        expect(error.cause).toBe(cause);
    });

    it('sets name to ApiCallError', () => {
        const error = createNetworkApiCallError(null);
        expect(error.name).toBe('ApiCallError');
    });
});

describe('isApiCallError', () => {
    it('returns true for ApiCallError', () => {
        const error = createApiCallError(400, '');
        expect(isApiCallError(error)).toBe(true);
    });

    it('returns true for error with statusCode', () => {
        const error = new Error('test') as any;
        error.statusCode = 404;
        expect(isApiCallError(error)).toBe(true);
    });

    it('returns false for plain Error', () => {
        expect(isApiCallError(new Error('test'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
        expect(isApiCallError(null)).toBe(false);
        expect(isApiCallError(undefined)).toBe(false);
        expect(isApiCallError('error')).toBe(false);
        expect(isApiCallError(42)).toBe(false);
    });
});

describe('getUserFacingErrorMessage', () => {
    it('returns userMessage from ApiCallError', () => {
        const error = createApiCallError(401, '');
        expect(getUserFacingErrorMessage(error)).toBe('Please sign in again.');
    });

    it('returns message from plain Error', () => {
        expect(getUserFacingErrorMessage(new Error('Something broke'))).toBe('Something broke');
    });

    it('returns fallback for non-Error values', () => {
        expect(getUserFacingErrorMessage(null)).toBe('Something went wrong. Please try again.');
        expect(getUserFacingErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
        expect(getUserFacingErrorMessage('string error')).toBe('Something went wrong. Please try again.');
    });

    it('uses custom fallback', () => {
        expect(getUserFacingErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
    });

    it('returns fallback for Error with empty message', () => {
        expect(getUserFacingErrorMessage(new Error('   '))).toBe('Something went wrong. Please try again.');
    });

    it('falls back to status message when userMessage is missing', () => {
        const error = createApiCallError(404, '');
        const noUserMsg = Object.assign(new Error('test'), {
            name: 'ApiCallError',
            statusCode: 404,
        });
        delete (noUserMsg as any).userMessage;
        expect(getUserFacingErrorMessage(noUserMsg)).toBe('The requested item was not found.');
    });
});
