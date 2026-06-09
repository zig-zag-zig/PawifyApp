import React, { useEffect } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppRelease, UpdateDownloadProgress, UpdateStatus } from '../model/types';
import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { DownloadProgressPanel } from './DownloadProgressPanel';
import { ReleaseNotes } from './ReleaseNotes';
import { ReleaseSummary } from './ReleaseSummary';
import { UpdateDialogActions } from './UpdateDialogActions';
import { UpdateDialogHeader } from './UpdateDialogHeader';

type AppUpdateModalProps = {
  visible: boolean;
  status: UpdateStatus;
  currentVersion: string;
  release: AppRelease | null;
  error: string | null;
  checking: boolean;
  updating: boolean;
  canInstallUpdates: boolean;
  downloadProgress: UpdateDownloadProgress | null;
  onClose: () => void;
  onCheckAgain: () => void;
  onUpdate: () => void;
  onSkipVersion: () => void;
};

export const AppUpdateModal = ({
  visible,
  status,
  currentVersion,
  release,
  error,
  checking,
  updating,
  canInstallUpdates,
  downloadProgress,
  onClose,
  onCheckAgain,
  onUpdate,
  onSkipVersion,
}: AppUpdateModalProps) => {
  const insets = useSafeAreaInsets();
  const availableRelease = status === 'available' ? release : null;
  const showUpdateAction = Boolean(availableRelease && canInstallUpdates);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!updating) {
        onClose();
      }
      return true;
    });

    return () => subscription.remove();
  }, [onClose, updating, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.dialog}>
        <UpdateDialogHeader
          status={status}
          currentVersion={currentVersion}
          checking={checking}
          updating={updating}
          onClose={onClose}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <ReleaseSummary release={release} />
          <ReleaseNotes release={release} status={status} error={error} />
          <DownloadProgressPanel
            downloadProgress={downloadProgress}
            fallbackContentLength={release?.assetSizeBytes ?? null}
          />
        </ScrollView>

        <UpdateDialogActions
          availableRelease={availableRelease}
          checking={checking}
          updating={updating}
          showUpdateAction={showUpdateAction}
          onClose={onClose}
          onCheckAgain={onCheckAgain}
          onUpdate={onUpdate}
          onSkipVersion={onSkipVersion}
        />
      </View>
    </View>
  );
};
