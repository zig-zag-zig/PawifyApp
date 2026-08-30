import * as crypto from 'crypto';
import { securityConfig } from '../../config/runtimeConfig.js';

/**
 * Pure OTP hashing primitives (no Firebase dependency).
 * Exported for unit testing. Keyed HMAC-SHA256 using the configured pepper.
 */
const PEPPER = securityConfig.passwordResetPepper;

export const hashOtp = (otp: string): string => {
    return crypto.createHmac('sha256', PEPPER).update(otp).digest('hex');
};

export const constantTimeEquals = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
        leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
};

export const isOtpMatch = (resetData: Record<string, unknown>, otp: string): boolean => {
    const hashedOtp = hashOtp(otp);

    if (typeof resetData.otpHash === 'string') {
        return constantTimeEquals(resetData.otpHash, hashedOtp);
    }

    return (
        typeof resetData.otp === 'string' && constantTimeEquals(hashOtp(resetData.otp), hashedOtp)
    );
};
