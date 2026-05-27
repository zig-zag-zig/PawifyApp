import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import {
    // @ts-ignore
    getReactNativePersistence,
    initializeAuth,
} from "firebase/auth";
import googleServices from "../../google-services.json";

const firebaseConfig = {
    apiKey: googleServices.client[0].api_key[0].current_key,
    authDomain: `${googleServices.project_info.project_id}.firebaseapp.com`,
    projectId: googleServices.project_info.project_id,
    storageBucket: googleServices.project_info.storage_bucket,
    messagingSenderId: googleServices.project_info.project_number,
    appId: googleServices.client[0].client_info.mobilesdk_app_id,
};

export const auth = initializeAuth(initializeApp(firebaseConfig), {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
