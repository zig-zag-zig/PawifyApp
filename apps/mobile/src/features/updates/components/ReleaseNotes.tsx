import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { updateCopy } from '../domain/updateCopy';
import type { AppRelease, UpdateStatus } from '../model/types';
import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { MarkdownText } from './MarkdownText';

type ReleaseNotesProps = {
  release: AppRelease | null;
  status: UpdateStatus;
  error: string | null;
};

export function ReleaseNotes({ release, status, error }: ReleaseNotesProps) {
  const isNotFound = status === 'not_found';
  const isError = status === 'error';

  if (isError || isNotFound) {
    return (
      <View style={[styles.messageBox, isNotFound && styles.infoMessageBox]}>
        <Text style={isNotFound ? styles.infoText : styles.errorText}>
          {error || (isNotFound ? updateCopy.errors.noPublicRelease : updateCopy.errors.checkFailed)}
        </Text>
      </View>
    );
  }

  if (!release) {
    return null;
  }

  return (
    <View style={styles.notesContainer}>
      <Text style={styles.notesTitle}>{updateCopy.modal.releaseNotesTitle}</Text>
      <ScrollView
        style={styles.notesScroll}
        contentContainerStyle={styles.notesContent}
        nestedScrollEnabled
      >
        <MarkdownText markdown={release.body} />
      </ScrollView>
    </View>
  );
}
