import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    runWithRequestContext,
    getRequestContext,
    setRequestContextFields,
} from '../../../src/common/logging/requestContext.js';

describe('requestContext', () => {
    it('retrieves context set within a scope', () => {
        const context = { requestId: 'req-1', endpoint: '/test' };
        let capturedContext: any;

        runWithRequestContext(context, () => {
            capturedContext = getRequestContext();
        });

        assert.deepEqual(capturedContext, context);
    });

    it('returns undefined outside of any scope', () => {
        assert.equal(getRequestContext(), undefined);
    });

    it('merges fields into existing context', () => {
        const context = { requestId: 'req-1' };
        let capturedContext: any;

        runWithRequestContext(context, () => {
            setRequestContextFields({ userId: 'user-1', taskId: 'task-1' });
            capturedContext = getRequestContext();
        });

        assert.deepEqual(capturedContext, {
            requestId: 'req-1',
            userId: 'user-1',
            taskId: 'task-1',
        });
    });

    it('setRequestContextFields is no-op when no context exists', () => {
        // Should not throw
        setRequestContextFields({ userId: 'nobody' });
        assert.equal(getRequestContext(), undefined);
    });

    it('context isolation between concurrent runs', async () => {
        const results: Array<{ run: number; ctx: any }> = [];

        await Promise.all([
            new Promise<void>((resolve) => {
                runWithRequestContext({ requestId: 'req-a' }, () => {
                    setRequestContextFields({ endpoint: '/a' });
                    results.push({ run: 1, ctx: getRequestContext() });
                    resolve();
                });
            }),
            new Promise<void>((resolve) => {
                runWithRequestContext({ requestId: 'req-b' }, () => {
                    setRequestContextFields({ endpoint: '/b' });
                    results.push({ run: 2, ctx: getRequestContext() });
                    resolve();
                });
            }),
        ]);

        const ctxA = results.find((r) => r.ctx!.requestId === 'req-a')!;
        const ctxB = results.find((r) => r.ctx!.requestId === 'req-b')!;
        assert.equal(ctxA.ctx!.endpoint, '/a');
        assert.equal(ctxB.ctx!.endpoint, '/b');
    });
});
