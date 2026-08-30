import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    createAbortError,
    isAbortError,
    delayWithAbort,
} from '../../../src/services/musicApi/abortableDelay.js';

describe('abortableDelay', () => {
    describe('createAbortError', () => {
        it('returns an Error with name AbortError', () => {
            const error = createAbortError();
            assert.equal(error.name, 'AbortError');
            assert.equal(error.message, 'Request aborted');
        });
    });

    describe('isAbortError', () => {
        it('returns true for AbortError', () => {
            assert.equal(isAbortError(createAbortError()), true);
        });

        it('returns false for regular Error', () => {
            assert.equal(isAbortError(new Error('other')), false);
        });

        it('returns false for strings', () => {
            assert.equal(isAbortError('error'), false);
        });

        it('returns false for null/undefined', () => {
            assert.equal(isAbortError(null), false);
            assert.equal(isAbortError(undefined), false);
        });
    });

    describe('delayWithAbort', () => {
        it('resolves after delay when no signal is provided', async () => {
            const startedAt = Date.now();
            await delayWithAbort(20);
            assert.ok(Date.now() - startedAt >= 18);
        });

        it('throws immediately when signal is already aborted', async () => {
            const controller = new AbortController();
            controller.abort();

            await assert.rejects(
                () => delayWithAbort(1000, controller.signal),
                (error: any) => error.name === 'AbortError',
            );
        });

        it('throws when signal is aborted during delay', async () => {
            const controller = new AbortController();

            const promise = delayWithAbort(500, controller.signal);
            setTimeout(() => controller.abort(), 10);

            await assert.rejects(
                () => promise,
                (error: any) => error.name === 'AbortError',
            );
        });
    });
});
