import { cert, getApps, getApp, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import * as fs from 'fs';
import { createLogger } from '../../common/logging/logger.js';
import { firebaseAdminConfig } from '../../config/runtimeConfig.js';

const logger = createLogger('infrastructure.firebase');

const loadServiceAccount = (): ServiceAccount => {
    if (firebaseAdminConfig.serviceAccountJson) {
        return JSON.parse(firebaseAdminConfig.serviceAccountJson) as ServiceAccount;
    }

    const filePath = firebaseAdminConfig.credentialsFilePath;
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(
            'Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.',
        );
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ServiceAccount;
};

const isEmulator = (): boolean => !!process.env.FIRESTORE_EMULATOR_HOST;

try {
    if (getApps().length === 0) {
        if (isEmulator()) {
            initializeApp({
                projectId: process.env.GCLOUD_PROJECT || 'pawify-test',
                databaseURL:
                    process.env.FIREBASE_DATABASE_URL || 'http://127.0.0.1:9000/?ns=pawify-test',
            });
        } else {
            initializeApp({
                credential: cert(loadServiceAccount()),
                ...(firebaseAdminConfig.databaseURL
                    ? { databaseURL: firebaseAdminConfig.databaseURL }
                    : {}),
            });
        }
    }

    logger.info('firebase admin initialized');
} catch (error) {
    logger.error('firebase admin initialization failed', { error });
    throw error;
}

const app = getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
