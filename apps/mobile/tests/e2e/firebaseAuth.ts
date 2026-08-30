import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import {
    connectAuthEmulator,
    // @ts-ignore
    getReactNativePersistence,
    initializeAuth,
} from "firebase/auth";
import {
    getFirebaseAuthEmulatorUrl,
    getFirebaseProjectId,
} from './firebaseAuthEmulator';

const projectId = getFirebaseProjectId(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
const firebaseConfig = {
    apiKey: 'fake-e2e-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
    messagingSenderId: '0',
    appId: '1:0:android:pawify-e2e',
};

export const auth = initializeAuth(initializeApp(firebaseConfig), {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

connectAuthEmulator(
    auth,
    getFirebaseAuthEmulatorUrl(process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST),
    { disableWarnings: true },
);
