import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useContentReady } from '../hooks/useContentReady';
import { useGlobalSpinner } from '../contexts/GlobalSpinnerContext';
import { useNotificationService } from '../hooks/useNotificationService';
import { useE2eNotificationTestTrigger } from '../hooks/useE2eNotificationTestTrigger';
import { useStartupUpdateCheck } from '../features/updates/hooks/useStartupUpdateCheck';
import { AuthStack } from './AuthStack';
import { MainStack } from './MainStack';

export const AppNavigator = () => {
    const { user, authCompleted } = useAuth();
    const { isWaitingForContent, onContentReady } = useContentReady(!authCompleted, authCompleted);
    useGlobalSpinner(!authCompleted || isWaitingForContent);
    useNotificationService({ enabled: authCompleted });
    useE2eNotificationTestTrigger();
    useStartupUpdateCheck();

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
