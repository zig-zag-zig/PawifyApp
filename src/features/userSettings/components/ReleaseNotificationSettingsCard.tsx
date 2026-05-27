import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  View,
} from 'react-native';
import { useToast } from '../../../components/ToastContext';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import {
  useReleaseNotificationSettings,
} from '../state/ReleaseNotificationSettingsContext';
import { getReleaseNotificationSettingsStyles } from './releaseNotificationSettingsStyles';
import { ReleaseNotificationSettings } from '../../../modules/models/models';

const lookbackOptions: Array<{ label: string; value: number | null }> = [
  { label: '1 mo', value: 1 },
  { label: '3 mo', value: 3 },
  { label: '6 mo', value: 6 },
  { label: '12 mo', value: 12 },
  { label: '24 mo', value: 24 },
  { label: '60 mo', value: 60 },
  { label: 'Unlimited', value: null },
];

function isSelected(current: number | null, value: number | null) {
  return current === value;
}

type SettingsSwitchRowProps = {
  disabled: boolean;
  helperText?: string;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof getReleaseNotificationSettingsStyles>;
  title: string;
  value: boolean;
};

function SettingsSwitchRow({
  disabled,
  helperText,
  onValueChange,
  styles,
  title,
  value,
}: SettingsSwitchRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTitleRow}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: '#374151', true: '#047857' }}
          thumbColor={value ? '#10b981' : '#9ca3af'}
        />
      </View>
      {helperText && (
        <Text style={styles.toggleSubtitle}>
          {helperText}
        </Text>
      )}
    </View>
  );
}

export function ReleaseNotificationSettingsCard() {
  const { showToast } = useToast();
  const {
    settings,
    isLoading,
    isSaving,
    updateSettings,
  } = useReleaseNotificationSettings();
  const styles = getReleaseNotificationSettingsStyles();
  const busy = isLoading || isSaving;

  const saveSettings = useCallback(async (nextSettings: ReleaseNotificationSettings) => {
    try {
      await updateSettings(nextSettings);
      showToast('Release notification settings updated', 'success');
    } catch (error) {
      console.warn('release-notification-settings: update failed', error);
      showToast(getUserFacingErrorMessage(error, 'Failed to update release notification settings.'), 'error');
    }
  }, [showToast, updateSettings]);

  const handleLookbackChange = useCallback((oldestReleaseDateMonths: number | null) => {
    if (settings.oldestReleaseDateMonths === oldestReleaseDateMonths || busy) {
      return;
    }

    void saveSettings({
      ...settings,
      oldestReleaseDateMonths,
    });
  }, [busy, saveSettings, settings]);

  const handleDatelessChange = useCallback((includeReleasesWithoutDate: boolean) => {
    if (settings.includeReleasesWithoutDate === includeReleasesWithoutDate || busy) {
      return;
    }

    void saveSettings({
      ...settings,
      includeReleasesWithoutDate,
    });
  }, [busy, saveSettings, settings]);

  return (
    <View style={styles.cardContent}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>Release Notifications</Text>
        {busy && <ActivityIndicator size="small" color="#86efac" />}
      </View>

      <Text style={styles.description}>
        MusicBrainz is community-added, so older releases can appear later. Choose how far back Pawify should notify you.
      </Text>

      <View style={styles.optionGroup}>
        <Text style={styles.optionLabel}>Oldest release date</Text>
        <View style={styles.chips}>
          {lookbackOptions.map((option) => {
            const selected = isSelected(settings.oldestReleaseDateMonths, option.value);
            return (
              <Pressable
                key={option.label}
                disabled={busy}
                onPress={() => handleLookbackChange(option.value)}
                style={[
                  styles.chip,
                  selected && styles.chipSelected,
                ]}
                android_ripple={{ color: '#164e3c' }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SettingsSwitchRow
        disabled={busy}
        onValueChange={handleDatelessChange}
        styles={styles}
        title="Include releases without dates"
        value={settings.includeReleasesWithoutDate}
      />
    </View>
  );
}
