import { BadRequestError } from '../../common/http/errors.js';
import { authenticatedHandler } from '../../infrastructure/http/authenticatedHandler.js';
import { requireString } from '../../common/http/validation.js';
import { pushTokenUseCases } from './pushTokenUseCases.js';

const MAX_PUSH_TOKEN_LENGTH = 4096;

const validatePushToken = (pushToken: string): void => {
    if (pushToken.length > MAX_PUSH_TOKEN_LENGTH || /\s/.test(pushToken)) {
        throw new BadRequestError(
            `The pushToken property in the body must be a token string without whitespace and at most ${MAX_PUSH_TOKEN_LENGTH} characters`,
        );
    }
};

export const savePushTokenHandler = authenticatedHandler(
    '/savePushToken',
    async ({ req, res, userId }) => {
        const deviceId = requireString(req.body, 'deviceId');
        const pushToken = requireString(req.body, 'pushToken');

        validatePushToken(pushToken);

        await pushTokenUseCases.savePushToken(userId, deviceId, pushToken);
        res.status(200).send('Push token saved successfully.');
    },
);

export const deletePushTokenHandler = authenticatedHandler(
    '/deletePushToken',
    async ({ req, res, userId }) => {
        const deviceId = requireString(req.body, 'deviceId');

        await pushTokenUseCases.deletePushToken(userId, deviceId);
        res.status(200).send('Push token deleted successfully.');
    },
);
