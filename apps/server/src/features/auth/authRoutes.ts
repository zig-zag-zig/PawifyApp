import express from 'express';
import {
    changeEmailHandler,
    deleteUserAccountHandler,
    revokeTokenHandler,
    sendOtpHandler,
    verifyOtpHandler,
} from './authHandlers.js';

export const authRoutes = express.Router();

authRoutes.post('/verifyOtp', verifyOtpHandler);
authRoutes.post('/sendOtp', sendOtpHandler);
authRoutes.get('/revokeToken', revokeTokenHandler);
authRoutes.post('/changeEmail', changeEmailHandler);
authRoutes.post('/deleteUserAccount', deleteUserAccountHandler);
