import {
    deleteDevicePushTokenFromDb,
    savePushTokenToDb,
} from '../../../services/firebase/pushTokenStore.js';
import type { PushTokenUseCaseDependencies } from '../ports.js';

export const pushTokenDependencies: PushTokenUseCaseDependencies = {
    pushTokenGateway: {
        savePushToken: savePushTokenToDb,
        deletePushToken: deleteDevicePushTokenFromDb,
    },
};
