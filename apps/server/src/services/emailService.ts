import { invokeDaprBinding } from '../infrastructure/dapr/daprBindings.js';

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export async function sendOtpEmail(
    to: string,
    otp: string,
    otpExpiryMinutes: number,
): Promise<void> {
    const escapedOtp = escapeHtml(otp);
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Your OTP code is:</p>
          <div style="background: #f4f4f4; padding: 10px; margin: 10px 0; font-size: 24px; letter-spacing: 2px;">
            <strong>${escapedOtp}</strong>
          </div>
          <p>This code will expire in ${otpExpiryMinutes} minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `;

    await invokeDaprBinding('smtp-gmail', {
        operation: 'create',
        data: html,
        metadata: {
            emailTo: to,
            subject: 'Your Password Reset OTP',
        },
    });
}
