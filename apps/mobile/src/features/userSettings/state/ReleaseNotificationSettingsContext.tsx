import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';
import { EventService } from '../../../services/eventService';
import { ReleaseNotificationSettings, DEFAULT_RELEASE_NOTIFICATION_SETTINGS } from '../../../shared/music';
import type { ReleaseNotificationSettingsResponse } from '../../../types/apiTypes';

type ReleaseNotificationSettingsContextValue = {
  settings: ReleaseNotificationSettings;
  isLoading: boolean;
  isSaving: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (settings: ReleaseNotificationSettings) => Promise<void>;
};

const ReleaseNotificationSettingsContext = createContext<ReleaseNotificationSettingsContextValue | null>(null);

export function ReleaseNotificationSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, getAccessToken } = useAuth();
  const apiClient = useApiClient(getAccessToken);
  const [settings, setSettings] = useState<ReleaseNotificationSettings>(DEFAULT_RELEASE_NOTIFICATION_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getReleaseNotificationSettings = useCallback(async () =>
    await apiClient.request<ReleaseNotificationSettingsResponse>(
      'getReleaseNotificationSettings',
      { method: 'GET' },
    ), [apiClient]);

  const updateReleaseNotificationSettings = useCallback(async (nextSettings: ReleaseNotificationSettings) =>
    await apiClient.request<ReleaseNotificationSettingsResponse>(
      'updateReleaseNotificationSettings',
      { body: await apiClient.withSourcePushToken({ ...nextSettings }) },
    ), [apiClient]);

  const refreshSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_RELEASE_NOTIFICATION_SETTINGS);
      return;
    }

    setIsLoading(true);
    try {
      setSettings(await getReleaseNotificationSettings());
    } catch (error) {
      console.warn('release-notification-settings: fetch failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [getReleaseNotificationSettings, user]);

  const updateSettings = useCallback(async (nextSettings: ReleaseNotificationSettings) => {
    if (!user) {
      return;
    }

    setIsSaving(true);
    try {
      const savedSettings = await updateReleaseNotificationSettings(nextSettings);
      setSettings(savedSettings);
      EventService.addEvent('releases');
    } finally {
      setIsSaving(false);
    }
  }, [updateReleaseNotificationSettings, user]);

  const handleSettingsEvent = useCallback((eventName: string, options?: { force?: boolean }) => {
    if (eventName !== 'releaseNotificationSettings') {
      return false;
    }

    if (!options?.force && AppState.currentState !== 'active') {
      return true;
    }

    void refreshSettings();
    EventService.consumeEvent(eventName);
    return true;
  }, [refreshSettings]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    EventService.getPendingEvents().forEach((_, eventName) => {
      handleSettingsEvent(eventName, { force: AppState.currentState === 'active' });
    });

    const unsubscribe = EventService.addListener((eventName) => {
      handleSettingsEvent(eventName);
    });

    return () => {
      unsubscribe();
    };
  }, [handleSettingsEvent]);

  const value = useMemo(() => ({
    settings,
    isLoading,
    isSaving,
    refreshSettings,
    updateSettings,
  }), [
    isLoading,
    isSaving,
    refreshSettings,
    settings,
    updateSettings,
  ]);

  return (
    <ReleaseNotificationSettingsContext.Provider value={value}>
      {children}
    </ReleaseNotificationSettingsContext.Provider>
  );
}

export function useReleaseNotificationSettings() {
  const context = useContext(ReleaseNotificationSettingsContext);
  if (!context) {
    throw new Error('useReleaseNotificationSettings must be used within ReleaseNotificationSettingsProvider');
  }

  return context;
}
