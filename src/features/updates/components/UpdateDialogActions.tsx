import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { updateCopy } from '../domain/updateCopy';
import type { AppRelease, UpdateDownloadProgress } from '../model/types';
import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { getProgressLabel } from './updateModalFormatting';

type ModalButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  loading?: boolean;
  disabled?: boolean;
};

type UpdateDialogActionsProps = {
  availableRelease: AppRelease | null;
  checking: boolean;
  updating: boolean;
  showUpdateAction: boolean;
  downloadProgress: UpdateDownloadProgress | null;
  onClose: () => void;
  onCheckAgain: () => void;
  onUpdate: () => void;
  onSkipVersion: () => void;
};

function ModalButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
}: ModalButtonProps) {
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
}

export function UpdateDialogActions({
  availableRelease,
  checking,
  updating,
  showUpdateAction,
  downloadProgress,
  onClose,
  onCheckAgain,
  onUpdate,
  onSkipVersion,
}: UpdateDialogActionsProps) {
  const isAvailable = Boolean(availableRelease);

  return (
    <View style={styles.actions}>
      <View style={styles.actionRow}>
        <ModalButton
          label={isAvailable ? updateCopy.modal.later : updateCopy.modal.close}
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
            label={updateCopy.modal.checkAgain}
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
          <Text style={styles.skipButtonText}>{updateCopy.modal.skipVersion}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
