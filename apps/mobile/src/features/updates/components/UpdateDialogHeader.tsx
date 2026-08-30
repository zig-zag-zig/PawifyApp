import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { getUpdateDialogTitle, updateCopy } from '../domain/updateCopy';
import type { UpdateStatus } from '../model/types';
import { appUpdateModalColors, appUpdateModalStyles as styles } from './appUpdateModalStyles';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

type UpdateDialogHeaderProps = {
  status: UpdateStatus;
  currentVersion: string;
  checking: boolean;
  updating: boolean;
  onClose: () => void;
};

function getIconName(status: UpdateStatus): MaterialIconName {
  switch (status) {
    case 'available':
      return 'system-update-alt';
    case 'current':
      return 'check-circle';
    case 'not_found':
      return 'info-outline';
    case 'checking':
      return 'refresh';
    default:
      return 'error-outline';
  }
}

function getIconColor(status: UpdateStatus): string {
  switch (status) {
    case 'current':
      return appUpdateModalColors.success;
    case 'not_found':
      return appUpdateModalColors.info;
    case 'error':
      return appUpdateModalColors.danger;
    default:
      return appUpdateModalColors.primary;
  }
}

export function UpdateDialogHeader({
  status,
  currentVersion,
  checking,
  updating,
  onClose,
}: UpdateDialogHeaderProps) {
  const iconColor = getIconColor(status);

  return (
    <View style={styles.header}>
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}22` }]}>
        {checking ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <MaterialIcons name={getIconName(status)} size={26} color={iconColor} />
        )}
      </View>
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={2}>{getUpdateDialogTitle(status)}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{updateCopy.modal.currentVersion(currentVersion)}</Text>
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
  );
}
