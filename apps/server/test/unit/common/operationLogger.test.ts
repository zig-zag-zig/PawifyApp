import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withOperationLogging } from '../../../src/common/logging/operationLogger.js';

describe('operationLogger', () => {
    it('logs start and completion with debug by default', async () => {
        const logs: Array<{ level: string; message: string }> = [];
        const logger = {
            debug: (message: string) => {
                logs.push({ level: 'debug', message });
            },
            info: (message: string) => {
                logs.push({ level: 'info', message });
            },
            warn: (message: string) => {
                logs.push({ level: 'warn', message });
            },
            error: (message: string) => {
                logs.push({ level: 'error', message });
            },
            child: () => logger,
        };

        const wrapped = withOperationLogging(logger as any, 'testOp', async (x: number) => x + 1);
        const result = await wrapped(41);

        assert.equal(result, 42);
        assert.ok(logs[0]!.message.includes('testOp started'));
        assert.ok(logs[1]!.message.includes('testOp completed'));
        assert.equal(logs[0]!.level, 'debug');
    });

    it('logs error and re-throws on failure', async () => {
        const errors: Array<{ message: string }> = [];
        const logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: (message: string) => {
                errors.push({ message });
            },
            child: () => logger,
        };

        const wrapped = withOperationLogging(logger as any, 'testOp', async () => {
            throw new Error('boom');
        });

        await assert.rejects(() => wrapped(), /boom/);
        assert.ok(errors[0]!.message.includes('testOp failed'));
    });
});
