import * as crypto from 'crypto';
import { auth, db } from '../../infrastructure/firebase/firebaseInit.js';
import { FieldValue } from 'firebase-admin/firestore';
import { createLogger } from '../../common/logging/logger.js';
import { sendOtpEmail } from '../emailService.js';
import { AccountError } from './accountErrors.js';
import { hashOtp, isOtpMatch } from './otpHashing.js';

// Re-export for backward-compatible imports and unit testing.
export { hashOtp, isOtpMatch };

const OTP_EXPIRY_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 3;
const logger = createLogger('services.account.passwordResetOtp');
const OTP_DELIVERY_FAILED_MESSAGE =
    'Could not send OTP. Please check the email address and try again.';
const RESET_REQUEST_NOT_FOUND_MESSAGE = 'Password reset request was not found or has expired.';
const OTP_ATTEMPTS_EXCEEDED_MESSAGE = 'Too many incorrect OTP attempts. Please request a new OTP.';

const getUidWithEmail = async (email: string) => {
    try {
        return await auth.getUserByEmail(email);
    } catch (error) {
        // Only an explicit "user not found" is a known failure. Anything else
        // (Auth outage, network error) propagates unwrapped so the client gets
        // a 500 instead of a misleading 400.
        if ((error as { code?: string }).code === 'auth/user-not-found') {
            return null;
        }
        throw error;
    }
};

export const sendOtp = async (email: string): Promise<void> => {
    const user = await getUidWithEmail(email);
    if (!user) {
        throw new AccountError('USER_NOT_FOUND', 'User not found');
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
    const resetRef = db.collection('passwordResets').doc(user.uid);

    await resetRef.set({
        otpHash: hashOtp(otp),
        expiresAt,
        attempts: 0,
        verified: false,
    });

    try {
        await sendOtpEmail(email, otp, OTP_EXPIRY_MINUTES);
    } catch (error) {
        logger.warn('send otp email delivery failed', { error });
        await resetRef.delete().catch(() => {});
        throw new AccountError('OTP_DELIVERY_FAILED', OTP_DELIVERY_FAILED_MESSAGE);
    }
};

export const verifyOtp = async (email: string, otp: string): Promise<string> => {
    const user = await getUidWithEmail(email);
    if (!user) {
        throw new AccountError('USER_NOT_FOUND', 'User not found');
    }

    const resetRef = db.collection('passwordResets').doc(user.uid);
    const doc = await resetRef.get();

    if (!doc.exists) {
        throw new AccountError('RESET_REQUEST_NOT_FOUND', RESET_REQUEST_NOT_FOUND_MESSAGE);
    }

    const resetData = doc.data();
    if (!resetData) {
        throw new AccountError('RESET_REQUEST_NOT_FOUND', RESET_REQUEST_NOT_FOUND_MESSAGE);
    }

    if (resetData.attempts >= MAX_OTP_ATTEMPTS) {
        await resetRef.delete();
        throw new AccountError('OTP_ATTEMPTS_EXCEEDED', OTP_ATTEMPTS_EXCEEDED_MESSAGE);
    }

    if (resetData.expiresAt.toDate() < new Date()) {
        await resetRef.delete();
        throw new AccountError('OTP_EXPIRED', 'OTP expired');
    }

    if (!isOtpMatch(resetData, otp)) {
        const attempts = (resetData.attempts ?? 0) + 1;

        if (attempts >= MAX_OTP_ATTEMPTS) {
            await resetRef.delete();
            throw new AccountError('OTP_ATTEMPTS_EXCEEDED', OTP_ATTEMPTS_EXCEEDED_MESSAGE);
        }

        await resetRef.update({
            attempts: FieldValue.increment(1),
        });
        throw new AccountError('INVALID_OTP', 'Invalid OTP');
    }

    const tempToken = await auth.createCustomToken(user.uid, { signInMethod: 'customToken' });

    await resetRef.delete();

    return tempToken;
};
