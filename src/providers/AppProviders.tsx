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
//   Auth                 — session owner; depends on: apiClient (access token,
//                          onAuthFailure → signOut), push registration, device id,
//                          push-token storage, EventService (via cleanup)
//   Toast                — no dependencies (standalone UI)
//   Update               — no dependencies (standalone)
//   ReleaseNotification  — no dependencies (standalone)
//   Cache                — no dependencies (in-memory store for images, etc.)
//   Following            — depends on: Auth, Cache, EventService; owns per-instance useTaskManager()
//   NewReleaseFeed       — depends on: Auth, Toast, EventService; owns per-instance useTaskManager()
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
