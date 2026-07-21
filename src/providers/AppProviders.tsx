import React from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { CacheProvider } from '../contexts/CacheContext';
import { GlobalSpinnerProvider } from '../contexts/GlobalSpinnerContext';
import { ToastProvider } from '../contexts/ToastContext';
import { FollowingProvider } from '../features/artists/state/FollowingContext';
import { NewReleaseFeedProvider } from '../features/release/state/NewReleaseFeedContext';
import { UpdateProvider } from '../features/updates/state/UpdateContext';
import { ReleaseNotificationSettingsProvider } from '../features/userSettings/state/ReleaseNotificationSettingsContext';

// Provider dependency order (outer → inner):
//
//   GlobalSpinner       — no dependencies (top-level visual overlay)
//   Auth                 — depends on: nothing (Firebase SDK self-initializes)
//   Toast                — depends on: nothing (standalone UI)
//   Update               — depends on: nothing (standalone)
//   ReleaseNotification  — depends on: nothing (standalone)
//   Cache                — depends on: nothing (in-memory store for images, etc.)
//   Following            — depends on: Auth, Cache; owns per-instance useTaskManager()
//   NewReleaseFeed       — depends on: Auth, Toast; owns per-instance useTaskManager()
// Note: useTaskManager is a hook (not a provider); each consumer has an isolated queue.
//
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
