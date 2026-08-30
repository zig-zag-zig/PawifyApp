/**
 * Typed account failures (B5).
 *
 * The account services throw AccountError for KNOWN, user-facing failures
 * (user not found, missing/expired reset request, invalid/expired OTP,
 * attempts exceeded, delivery/session/email-change failures). The auth use
 * cases map AccountError to BadRequestError with user-facing messages.
 *
 * Unexpected errors (TypeError, Firestore/Auth outages, anything unrecognized)
 * are NEVER wrapped in AccountError: they propagate unwrapped so
 * errorMiddleware returns 500 without leaking internal messages.
 */

export type AccountErrorCode =
    | 'USER_NOT_FOUND'
    | 'RESET_REQUEST_NOT_FOUND'
    | 'OTP_EXPIRED'
    | 'OTP_ATTEMPTS_EXCEEDED'
    | 'INVALID_OTP'
    | 'OTP_DELIVERY_FAILED'
    | 'SESSION_UPDATE_FAILED'
    | 'EMAIL_CHANGE_FAILED';

export class AccountError extends Error {
    readonly code: AccountErrorCode;

    constructor(code: AccountErrorCode, message: string) {
        super(message);
        this.name = 'AccountError';
        this.code = code;
    }
}
