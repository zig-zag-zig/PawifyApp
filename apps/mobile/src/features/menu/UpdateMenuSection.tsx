import React from 'react';
import { View } from 'react-native';
import { MenuItem } from './MenuItem';
import { getMenuStyles } from './menuStyles';
import { useAppUpdate } from '../updates/state/UpdateContext';

export function UpdateMenuSection() {
  const appUpdate = useAppUpdate();
  const styles = getMenuStyles();

  const updateDescription = appUpdate.status === 'available' && appUpdate.latestRelease
    ? `Version ${appUpdate.latestRelease.version} available${appUpdate.skippedReleaseTag === appUpdate.latestRelease.tagName ? ' (skipped on startup)' : ''}`
    : appUpdate.isConfigured
      ? `Current version ${appUpdate.currentVersion}`
      : 'Update source not configured';

  return (
    <View style={{ marginTop: styles.section.marginTop + 10 }}>
      <View style={styles.menuCard}>
        <MenuItem
          icon="system-update-alt"
          label="App Updates"
          subtitle={updateDescription}
          onPress={() => {
            void appUpdate.checkForUpdates({
              showModalOnUpdate: true,
              showModalWhenCurrent: true,
            });
          }}
          loading={appUpdate.isChecking}
          disabled={!appUpdate.isConfigured}
          showDivider={false}
        />
      </View>
    </View>
  );
}
