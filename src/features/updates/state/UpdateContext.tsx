import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useToast } from '../../../contexts/ToastContext';
import { AppUpdateModal } from '../components/AppUpdateModal';
import { updateCopy } from '../domain/updateCopy';
import type {
  AppRelease,
  UpdateCheckOptions,
  UpdateDownloadProgress,
  UpdateStatus,
} from '../model/types';
import { AppUpdateNoReleaseError, appUpdateService } from '../services/appUpdateService';

type UpdateContextType = {
  status: UpdateStatus;
  isChecking: boolean;
  isConfigured: boolean;
  canInstallUpdates: boolean;
  currentVersion: string;
  latestRelease: AppRelease | null;
  skippedReleaseTag: string | null;
  error: string | null;
  checkedAt: number | null;
  downloadProgress: UpdateDownloadProgress | null;
  checkForUpdates: (options?: UpdateCheckOptions) => Promise<void>;
  showUpdateModal: () => void;
  hideUpdateModal: () => void;
  installUpdate: () => Promise<void>;
  skipLatestRelease: () => Promise<void>;
};

const UpdateContext = createContext<UpdateContextType | null>(null);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return updateCopy.errors.checkFailed;
}

export const UpdateProvider = ({ children }: { children: ReactNode }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [skippedReleaseTag, setSkippedReleaseTag] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(appUpdateService.getCurrentVersion());
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const isConfigured = appUpdateService.isConfigured();
  const canInstallUpdates = appUpdateService.isInstallSupported();

  useEffect(() => {
    void appUpdateService.cleanDownloadedUpdates().catch(() => undefined);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && !installingRef.current) {
        void appUpdateService.cleanDownloadedUpdates().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, []);

  const checkForUpdates = useCallback(async (options: UpdateCheckOptions = {}) => {
    if (checkingRef.current) return;

    if (!isConfigured) {
      const message = updateCopy.errors.sourceNotConfigured;
      setStatus('error');
      setError(message);
      if (!options.silent) {
        showToast(message, 'error');
        setModalVisible(true);
      }
      return;
    }

    checkingRef.current = true;
    setStatus('checking');
    setError(null);
    setDownloadProgress(null);

    try {
      const result = await appUpdateService.checkForUpdate();
      const skippedTag = await appUpdateService.getSkippedReleaseTag();
      setCurrentVersion(result.currentVersion);
      setLatestRelease(result.release);
      setSkippedReleaseTag(skippedTag);
      setCheckedAt(result.checkedAt);
      setStatus(result.isAvailable ? 'available' : 'current');
      const skippedOnStartup = options.respectSkippedVersion && skippedTag === result.release.tagName;

      if (result.isAvailable && options.showModalOnUpdate && !skippedOnStartup) {
        setModalVisible(true);
      } else if (!result.isAvailable && options.showModalWhenCurrent) {
        setModalVisible(true);
      } else if (!result.isAvailable && !options.silent) {
        showToast(updateCopy.toast.current, 'success');
      }
    } catch (caught) {
      const message = getErrorMessage(caught);
      const releaseNotFound = caught instanceof AppUpdateNoReleaseError;
      setStatus(releaseNotFound ? 'not_found' : 'error');
      setError(message);
      setLatestRelease(null);
      setCheckedAt(Date.now());
      if (!options.silent) {
        showToast(message, releaseNotFound ? 'info' : 'error');
        setModalVisible(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [isConfigured, showToast]);

  const installUpdate = useCallback(async () => {
    if (!latestRelease) return;
    if (installingRef.current) return;

    installingRef.current = true;
    setError(null);
    try {
      await appUpdateService.downloadAndInstallUpdate(latestRelease, setDownloadProgress);
    } catch (caught) {
      showToast(getErrorMessage(caught), 'error');
    } finally {
      installingRef.current = false;
      setDownloadProgress(null);
    }
  }, [latestRelease, showToast]);

  const skipLatestRelease = useCallback(async () => {
    if (!latestRelease) return;

    try {
      await appUpdateService.skipRelease(latestRelease);
      setSkippedReleaseTag(latestRelease.tagName);
      setModalVisible(false);
      showToast(updateCopy.toast.skipped(latestRelease.version), 'info');
    } catch {
      showToast(updateCopy.errors.savePreferenceFailed, 'error');
    }
  }, [latestRelease, showToast]);

  const value = useMemo<UpdateContextType>(() => ({
    status,
    isChecking: status === 'checking',
    isConfigured,
    canInstallUpdates,
    currentVersion,
    latestRelease,
    skippedReleaseTag,
    error,
    checkedAt,
    downloadProgress,
    checkForUpdates,
    showUpdateModal: () => setModalVisible(true),
    hideUpdateModal: () => {
      if (!downloadProgress) setModalVisible(false);
    },
    installUpdate,
    skipLatestRelease,
  }), [
    status,
    isConfigured,
    canInstallUpdates,
    currentVersion,
    latestRelease,
    skippedReleaseTag,
    error,
    checkedAt,
    downloadProgress,
    checkForUpdates,
    installUpdate,
    skipLatestRelease,
  ]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <AppUpdateModal
        visible={modalVisible}
        status={status}
        currentVersion={currentVersion}
        release={latestRelease}
        error={error}
        checking={status === 'checking'}
        updating={Boolean(downloadProgress)}
        canInstallUpdates={canInstallUpdates}
        downloadProgress={downloadProgress}
        onClose={() => {
          if (!downloadProgress) setModalVisible(false);
        }}
        onCheckAgain={() => {
          void checkForUpdates({
            showModalOnUpdate: true,
            showModalWhenCurrent: true,
          });
        }}
        onUpdate={() => {
          void installUpdate();
        }}
        onSkipVersion={() => {
          void skipLatestRelease();
        }}
      />
    </UpdateContext.Provider>
  );
};

export const useAppUpdate = () => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useAppUpdate must be used within an UpdateProvider');
  }

  return context;
};
