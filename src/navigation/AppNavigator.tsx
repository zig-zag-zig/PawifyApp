import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppUpdate } from '../features/updates/state/UpdateContext';
import { useContentReady } from '../hooks/useContentReady';
import { useGlobalSpinner } from '../contexts/GlobalSpinnerContext';
import { useNotificationService } from '../hooks/useNotificationService';
import { AuthStack } from './AuthStack';
import { MainStack } from './MainStack';

export const AppNavigator = () => {
    const { user, authCompleted } = useAuth();
    const appUpdate = useAppUpdate();
    const updateStartupCheckedRef = useRef(false);
    const { isWaitingForContent, onContentReady } = useContentReady(!authCompleted, authCompleted);
    useGlobalSpinner(!authCompleted || isWaitingForContent);
    useNotificationService({ enabled: authCompleted });

    useEffect(() => {
        if (!authCompleted || updateStartupCheckedRef.current || !appUpdate.isConfigured) return;

        updateStartupCheckedRef.current = true;
        void appUpdate.checkForUpdates({
            silent: true,
            showModalOnUpdate: true,
            respectSkippedVersion: true,
        });
    }, [authCompleted, appUpdate]);

    return (
        <View style={styles.container}>
            {authCompleted && (
                <View style={styles.container} onLayout={onContentReady}>
                    {user ? <MainStack /> : <AuthStack />}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
