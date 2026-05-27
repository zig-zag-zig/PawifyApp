import React, { useEffect, useRef } from 'react';
import { Spinner } from '../components/StyledComponents';
import { useAuth } from '../contexts/AuthContext';
import { useAppUpdate } from '../features/updates/state/UpdateContext';
import { useNotificationService } from '../hooks/useNotificationService';
import { AuthStack } from './AuthStack';
import { MainStack } from './MainStack';

export const AppNavigator = () => {
    const { user, authCompleted } = useAuth();
    const appUpdate = useAppUpdate();
    const updateStartupCheckedRef = useRef(false);
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

    if (!authCompleted) return <Spinner isLoading={true} />;
    return user ? <MainStack /> : <AuthStack />;
};
