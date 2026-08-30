import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePasswordResetPepper } from '../../../src/config/runtimeConfig.js';

/**
 * Tests the ACTUAL production pepper validation logic exported from runtimeConfig.
 * Regression coverage: if runtimeConfig's validation changes, these break.
 */
describe('securityConfig pepper validation (production code)', () => {
    it('throws when PASSWORD_RESET_PEPPER is missing in production', () => {
        assert.throws(() => resolvePasswordResetPepper(undefined, undefined, true), {
            message:
                'PASSWORD_RESET_PEPPER is required in production. Set ALLOW_INSECURE_PASSWORD_RESET_PEPPER=true to bypass.',
        });

        assert.throws(() => resolvePasswordResetPepper('', undefined, true), {
            message:
                'PASSWORD_RESET_PEPPER is required in production. Set ALLOW_INSECURE_PASSWORD_RESET_PEPPER=true to bypass.',
        });
    });

    it('does NOT throw when pepper is missing in non-production', () => {
        assert.equal(
            resolvePasswordResetPepper(undefined, undefined, false),
            'insecure-dev-pepper',
        );
        assert.equal(resolvePasswordResetPepper('', undefined, false), 'insecure-dev-pepper');
    });

    it('ALLOW_INSECURE_PASSWORD_RESET_PEPPER=true bypasses the production requirement', () => {
        assert.equal(resolvePasswordResetPepper(undefined, 'true', true), 'insecure-dev-pepper');
    });

    it('configured pepper is returned as-is (trimmed)', () => {
        assert.equal(
            resolvePasswordResetPepper(
                '  my-secret-pepper-value-32-bytes-long!  ',
                undefined,
                true,
            ),
            'my-secret-pepper-value-32-bytes-long!',
        );
    });

    it('configured pepper takes precedence over allowInsecure', () => {
        assert.equal(
            resolvePasswordResetPepper('real-secret-pepper', 'true', true),
            'real-secret-pepper',
        );
    });
});
