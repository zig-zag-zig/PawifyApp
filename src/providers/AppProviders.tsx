import React from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { CacheProvider } from '../contexts/CacheContext';
import { GlobalSpinnerProvider } from '../contexts/GlobalSpinnerContext';
import { ToastProvider } from '../components/ToastContext';
import { FollowingProvider } from '../features/artists/state/FollowingContext';
import { NewReleaseFeedProvider } from '../features/release/state/NewReleaseFeedContext';
import { UpdateProvider } from '../features/updates/state/UpdateContext';
import { ReleaseNotificationSettingsProvider } from '../features/userSettings/state/ReleaseNotificationSettingsContext';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <GlobalSpinnerProvider>
        <AuthProvider>
            <ToastProvider>
                <UpdateProvider>
                    <ReleaseNotificationSettingsProvider>
                        <CacheProvider>
                            <FollowingProvider>
                                <NewReleaseFeedProvider>
                                    {children}
                                </NewReleaseFeedProvider>
                            </FollowingProvider>
                        </CacheProvider>
                    </ReleaseNotificationSettingsProvider>
                </UpdateProvider>
            </ToastProvider>
        </AuthProvider>
    </GlobalSpinnerProvider>
);
