import { useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppUpdate } from '../state/UpdateContext';

/**
 * Runs the one-time startup update check once the auth gate completes.
 * Extracted from AppNavigator so the navigator stays a pure view switcher.
 */
export function useStartupUpdateCheck() {
  const { authCompleted } = useAuth();
  const appUpdate = useAppUpdate();
  const updateStartupCheckedRef = useRef(false);

  useEffect(() => {
    if (!authCompleted || updateStartupCheckedRef.current || !appUpdate.isConfigured) return;

    updateStartupCheckedRef.current = true;
    void appUpdate.checkForUpdates({
      silent: true,
      showModalOnUpdate: true,
      respectSkippedVersion: true,
    });
  }, [authCompleted, appUpdate]);
}
