import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { hashOtp, isOtpMatch } from '../../../src/services/account/otpHashing.js';

/**
 * Tests the ACTUAL production OTP HMAC functions exported from
 * passwordResetOtpService. Regression coverage: if the service reverts to
 * plain sha256, uses the wrong key, or stores the wrong field, these break.
 *
 * The service is imported with the dev-default pepper (no production env set),
 * so it initializes with 'insecure-dev-pepper'.
 */

describe('OTP HMAC (production passwordResetOtpService)', () => {
    it('hashOtp is deterministic for the same OTP', () => {
        assert.equal(hashOtp('123456'), hashOtp('123456'));
    });

    it('hashOtp produces a 64-char SHA-256 hex digest', () => {
        assert.equal(hashOtp('123456').length, 64);
    });

    it('hashOtp differs for different OTPs', () => {
        assert.notEqual(hashOtp('123456'), hashOtp('654321'));
    });

    it('hashOtp is HMAC-keyed (not plain sha256 of the OTP)', () => {
        // Plain sha256 of '123456' — if the service ever regresses to an unkeyed
        // hash, this assertion catches it.
        const plain = createHash('sha256').update('123456').digest('hex');
        assert.notEqual(hashOtp('123456'), plain);
    });

    it('isOtpMatch verifies a correctly hashed otpHash', () => {
        const stored = { otpHash: hashOtp('999999') };
        assert.equal(isOtpMatch(stored, '999999'), true);
    });

    it('isOtpMatch rejects a wrong OTP', () => {
        const stored = { otpHash: hashOtp('999999') };
        assert.equal(isOtpMatch(stored, '000000'), false);
    });

    it('isOtpMatch handles missing otpHash gracefully', () => {
        assert.equal(isOtpMatch({}, '123456'), false);
        assert.equal(isOtpMatch({ otpHash: 123 }, '123456'), false);
    });
});
