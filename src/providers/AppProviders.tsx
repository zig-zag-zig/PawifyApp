import React from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { CacheProvider } from '../contexts/CacheContext';
import { FollowProvider } from '../contexts/FollowContext';
import { NewReleasesProvider } from '../contexts/NewReleasesContext';
import { ToastProvider } from '../components/ToastContext';
import { UpdateProvider } from '../features/updates/state/UpdateContext';
import { ReleaseNotificationSettingsProvider } from '../features/userSettings/state/ReleaseNotificationSettingsContext';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AuthProvider>
        <ToastProvider>
            <UpdateProvider>
                <ReleaseNotificationSettingsProvider>
                    <CacheProvider>
                        <FollowProvider>
                            <NewReleasesProvider>
                                {children}
                            </NewReleasesProvider>
                        </FollowProvider>
                    </CacheProvider>
                </ReleaseNotificationSettingsProvider>
            </UpdateProvider>
        </ToastProvider>
    </AuthProvider>
);
