import React from 'react';
import { Text, View } from 'react-native';
import { updateCopy } from '../domain/updateCopy';
import type { AppRelease } from '../model/types';
import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { formatPublishedDate } from './updateModalFormatting';

type ReleaseSummaryProps = {
  release: AppRelease | null;
};

export function ReleaseSummary({ release }: ReleaseSummaryProps) {
  if (!release) {
    return null;
  }

  const publishedDate = formatPublishedDate(release.publishedAt);

  return (
    <View style={styles.releaseSummary}>
      <View style={styles.versionPill}>
        <Text style={styles.versionText}>{updateCopy.modal.latestVersion(release.version)}</Text>
      </View>
      <Text style={styles.releaseName} numberOfLines={2}>
        {release.name}
      </Text>
      {publishedDate && <Text style={styles.releaseMeta}>{updateCopy.modal.released(publishedDate)}</Text>}
      {release.assetName && (
        <Text style={styles.releaseMeta} numberOfLines={1}>
          {release.assetName}
        </Text>
      )}
    </View>
  );
}
