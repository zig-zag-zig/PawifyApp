import { publicHandler } from '../../common/http/handlers.js';
import { authenticatedHandler } from '../../infrastructure/http/authenticatedHandler.js';
import { requireString } from '../../common/http/validation.js';
import { authUseCases } from './authUseCases.js';

export const verifyOtpHandler = publicHandler('/verifyOtp', async (req, res) => {
    const email = requireString(req.body, 'email');
    const otp = requireString(req.body, 'otp');

    res.status(200).json(await authUseCases.verifyOtp(email, otp));
});

export const sendOtpHandler = publicHandler('/sendOtp', async (req, res) => {
    const email = requireString(req.body, 'email');

    await authUseCases.sendOtp(email);
    res.send('OTP sent successfully');
});

export const revokeTokenHandler = authenticatedHandler('/revokeToken', async ({ res, userId }) => {
    await authUseCases.revokeToken(userId);
    res.status(204).send();
});

export const changeEmailHandler = authenticatedHandler(
    '/changeEmail',
    async ({ req, res, userId }) => {
        const email = requireString(req.body, 'email');

        await authUseCases.changeEmail(userId, email);
        res.status(204).send();
    },
);

export const deleteUserAccountHandler = authenticatedHandler(
    '/deleteUserAccount',
    async ({ res, userId }) => {
        await authUseCases.deleteUserAccount(userId);
        res.status(200).send('User account and all associated data deleted successfully.');
    },
);
