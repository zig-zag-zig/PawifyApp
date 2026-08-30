import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import type { UpdateDownloadProgress } from '../model/types';
import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { formatBytes, getProgressLabel } from './updateModalFormatting';

type DownloadProgressPanelProps = {
  downloadProgress: UpdateDownloadProgress | null;
  fallbackContentLength: number | null;
};

export function DownloadProgressPanel({
  downloadProgress,
  fallbackContentLength,
}: DownloadProgressPanelProps) {
  if (!downloadProgress) {
    return null;
  }

  const progressPercent = downloadProgress.progress === null || downloadProgress.progress === undefined
    ? null
    : Math.round(downloadProgress.progress * 100);
  const progressWidth = `${Math.max(3, progressPercent ?? 18)}%` as `${number}%`;
  const bytesWritten = formatBytes(downloadProgress.bytesWritten);
  const contentLength = formatBytes(downloadProgress.contentLength ?? fallbackContentLength);

  return (
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
  );
}
