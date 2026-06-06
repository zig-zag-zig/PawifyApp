import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppRelease, UpdateDownloadProgress, UpdateStatus } from '../model/types';

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

function formatPublishedDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatBytes(value: number | null): string | null {
  if (!value || value <= 0) return null;

  const mb = value / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;

  return `${Math.round(value / 1024)} KB`;
}

function getProgressLabel(progress: UpdateDownloadProgress | null): string {
  switch (progress?.stage) {
    case 'checking-permission':
      return 'Preparing installer';
    case 'downloading':
      return 'Downloading update';
    case 'opening-installer':
      return 'Opening installer';
    default:
      return 'Preparing update';
  }
}

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
  const styles = getStyles();
  const availableRelease = status === 'available' ? release : null;
  const currentRelease = status === 'current' ? release : null;
  const isAvailable = Boolean(availableRelease);
  const isCurrent = Boolean(currentRelease);
  const isNotFound = status === 'not_found';
  const isError = status === 'error';
  const isChecking = status === 'checking';
  const publishedDate = formatPublishedDate(release?.publishedAt ?? null);
  const progressPercent = downloadProgress?.progress === null || downloadProgress?.progress === undefined
    ? null
    : Math.round(downloadProgress.progress * 100);
  const progressWidth = `${Math.max(3, progressPercent ?? 18)}%` as `${number}%`;
  const bytesWritten = formatBytes(downloadProgress?.bytesWritten ?? null);
  const contentLength = formatBytes(downloadProgress?.contentLength ?? release?.assetSizeBytes ?? null);
  const showUpdateAction = Boolean(availableRelease && canInstallUpdates);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [onClose, visible]);

  if (!visible) {
    return null;
  }

  const title = isAvailable
    ? 'Update Available'
    : isCurrent
      ? 'App Is Up To Date'
      : isNotFound
        ? 'No Public Release Found'
        : isChecking
          ? 'Checking for Updates'
          : 'Update Check Failed';

  const iconName = isAvailable
    ? 'system-update-alt'
    : isCurrent
      ? 'check-circle'
      : isNotFound
        ? 'info-outline'
        : isChecking
          ? 'refresh'
          : 'error-outline';

  const iconColor = isError ? '#ef4444' : isCurrent ? '#22c55e' : isNotFound ? '#38bdf8' : '#8b5cf6';

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.dialog}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}22` }]}>
            {checking ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <MaterialIcons name={iconName} size={26} color={iconColor} />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Current version {currentVersion}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            disabled={updating}
            style={styles.closeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Close update dialog"
          >
            <MaterialIcons
              name="close"
              size={24}
              color={updating ? styles.iconDisabled.color : styles.iconMuted.color}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {release && (
            <View style={styles.releaseSummary}>
              <View style={styles.versionPill}>
                <Text style={styles.versionText}>Latest {release.version}</Text>
              </View>
              <Text style={styles.releaseName} numberOfLines={2}>
                {release.name}
              </Text>
              {publishedDate && <Text style={styles.releaseMeta}>Released {publishedDate}</Text>}
              {release.assetName && (
                <Text style={styles.releaseMeta} numberOfLines={1}>
                  {release.assetName}
                </Text>
              )}
            </View>
          )}

          {isError || isNotFound ? (
            <View style={[styles.messageBox, isNotFound && styles.infoMessageBox]}>
              <Text style={isNotFound ? styles.infoText : styles.errorText}>
                {error || (isNotFound
                  ? 'No public GitHub release was found for this app.'
                  : 'Could not check for updates.')}
              </Text>
            </View>
          ) : release ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesTitle}>Release Notes</Text>
              <ScrollView
                style={styles.notesScroll}
                contentContainerStyle={styles.notesContent}
                nestedScrollEnabled
              >
                <Text style={styles.notesText}>{release.body}</Text>
              </ScrollView>
            </View>
          ) : null}

          {downloadProgress && (
            <View style={styles.progressPanel}>
              <View style={styles.progressHeader}>
                <View style={styles.progressTitleRow}>
                  <MaterialIcons name="download" size={18} color={styles.progressTitle.color} />
                  <Text style={styles.progressTitle} numberOfLines={1}>
                    {getProgressLabel(downloadProgress)}
                  </Text>
                </View>
                {progressPercent !== null && (
                  <Text style={styles.progressPercent}>{progressPercent}%</Text>
                )}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: progressWidth }]} />
              </View>
              {(bytesWritten || contentLength) && (
                <Text style={styles.progressMeta}>
                  {bytesWritten || '0 KB'}{contentLength ? ` of ${contentLength}` : ''}
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <ModalButton
              label={isAvailable ? 'Later' : 'Close'}
              onPress={onClose}
              variant="secondary"
              disabled={updating}
            />
            {showUpdateAction && availableRelease ? (
              <ModalButton
                label={updating ? getProgressLabel(downloadProgress) : availableRelease.downloadLabel}
                onPress={onUpdate}
                icon="download"
                loading={updating}
                disabled={updating}
              />
            ) : !isAvailable ? (
              <ModalButton
                label="Check Again"
                onPress={onCheckAgain}
                icon="refresh"
                loading={checking}
                disabled={checking}
              />
            ) : null}
          </View>
          {showUpdateAction && !updating && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkipVersion}
              activeOpacity={0.75}
            >
              <Text style={styles.skipButtonText}>Do Not Ask Again for This Version</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

type ModalButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  loading?: boolean;
  disabled?: boolean;
};

const ModalButton = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
}: ModalButtonProps) => {
  const styles = getStyles();
  const isSecondary = variant === 'secondary';
  const iconColor = isSecondary ? styles.secondaryButtonText.color : '#ffffff';

  return (
    <TouchableOpacity
      style={[
        styles.modalButton,
        isSecondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : icon ? (
        <MaterialIcons name={icon} size={19} color={iconColor} />
      ) : null}
      <Text style={isSecondary ? styles.secondaryButtonText : styles.primaryButtonText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const getStyles = () => {
  const colors = {
    overlay: 'rgba(0, 0, 0, 0.62)',
    surface: '#1f232b',
    nested: '#111827',
    border: '#303742',
    text: '#f8fafc',
    muted: '#9ca3af',
    primary: '#8b5cf6',
  };

  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
      paddingHorizontal: 20,
      backgroundColor: colors.overlay,
      zIndex: 9000,
      elevation: 9000,
    },
    dialog: {
      width: '100%',
      maxHeight: '88%',
      alignSelf: 'center',
      maxWidth: 460,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    iconContainer: {
      width: 42,
      height: 42,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconMuted: {
      color: colors.muted,
    },
    iconDisabled: {
      color: '#4b5563',
    },
    body: {
      flexShrink: 1,
    },
    bodyContent: {
      paddingBottom: 2,
    },
    releaseSummary: {
      backgroundColor: colors.nested,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      marginBottom: 14,
      gap: 6,
    },
    versionPill: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    versionText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    releaseName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 21,
    },
    releaseMeta: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    notesContainer: {
      marginBottom: 16,
    },
    notesTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    notesScroll: {
      maxHeight: 220,
      minHeight: 96,
      backgroundColor: colors.nested,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notesContent: {
      padding: 14,
    },
    notesText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 21,
    },
    messageBox: {
      backgroundColor: '#2a1719',
      borderWidth: 1,
      borderColor: '#7f1d1d',
      borderRadius: 8,
      padding: 14,
      marginBottom: 16,
    },
    errorText: {
      color: '#ef4444',
      fontSize: 14,
      lineHeight: 20,
    },
    infoMessageBox: {
      backgroundColor: '#0b2230',
      borderColor: '#155e75',
    },
    infoText: {
      color: '#38bdf8',
      fontSize: 14,
      lineHeight: 20,
    },
    progressPanel: {
      backgroundColor: colors.nested,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      marginBottom: 16,
      gap: 10,
    },
    progressHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    progressTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    progressTitle: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    progressPercent: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: '#303742',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    progressMeta: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    actions: {
      gap: 10,
      paddingTop: 10,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    modalButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    disabledButton: {
      opacity: 0.65,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 42,
      borderRadius: 999,
      backgroundColor: '#171b22',
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    skipButtonText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
};
