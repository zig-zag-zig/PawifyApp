import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { getMenuStyles } from './menuStyles';

export function MenuItem({ icon, label, subtitle, onPress, rightElement, danger = false, showDivider = true, disabled = false, loading = false }: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
  showDivider?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const styles = getMenuStyles();
  const isDisabled = disabled || loading || !onPress;

  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        danger && styles.menuItemDanger,
        !showDivider && styles.menuItemLast,
        !onPress && styles.menuItemStatic,
        disabled && styles.menuItemDisabled,
      ]}
      onPress={onPress}
      activeOpacity={!isDisabled ? 0.7 : 1}
      disabled={isDisabled}
    >
      <MaterialIcons
        name={icon as any}
        size={24}
        color={danger ? '#ef4444' : '#FFF'}
        style={styles.menuIcon}
      />
      <View style={styles.menuLabelContainer}>
        <Text
          style={[
            styles.menuLabel,
            danger && styles.menuLabelDanger,
          ]}
        >
          {label}
        </Text>
        {subtitle && (
          <Text style={styles.menuSubtitle}>
            {subtitle}
          </Text>
        )}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#cbd5e1" />
      ) : rightElement ? (
        <View style={styles.menuRight}>{rightElement}</View>
      ) : null}
    </TouchableOpacity>
  );
}
