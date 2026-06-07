import type { UpdateStatus } from '../model/types';

export const updateCopy = {
  errors: {
    checkFailed: 'Could not check for updates.',
    sourceNotConfigured: 'Update source is not configured.',
    noPublicRelease: 'No update is available right now.',
    missingReleaseMetadata: 'Latest release is missing required update metadata.',
    unexpectedReleaseResponse: 'Update check returned an unexpected response.',
    installPermissionRequired: 'Allow app installs for Pawify in Settings, then tap Install Update again.',
    downloadCancelled: 'Update download was cancelled',
    savePreferenceFailed: 'Could not save update preference',
  },
  toast: {
    current: 'Pawify is up to date',
    skipped: (version: string) => `Skipped ${version}`,
  },
  modal: {
    title: {
      available: 'Update Available',
      current: 'Pawify Is Up To Date',
      notFound: 'No Update Available',
      checking: 'Checking for Updates',
      error: 'Update Check Failed',
    },
    currentVersion: (version: string) => `Current version ${version}`,
    latestVersion: (version: string) => `Latest ${version}`,
    released: (date: string) => `Released ${date}`,
    releaseNotesTitle: 'Release Notes',
    later: 'Later',
    close: 'Close',
    checkAgain: 'Check Again',
    skipVersion: 'Do Not Ask Again for This Version',
  },
  progress: {
    checkingPermission: 'Preparing installer',
    downloading: 'Downloading update',
    openingInstaller: 'Opening installer',
    preparing: 'Preparing update',
  },
};

export function getUpdateDialogTitle(status: UpdateStatus): string {
  switch (status) {
    case 'available':
      return updateCopy.modal.title.available;
    case 'current':
      return updateCopy.modal.title.current;
    case 'not_found':
      return updateCopy.modal.title.notFound;
    case 'checking':
      return updateCopy.modal.title.checking;
    default:
      return updateCopy.modal.title.error;
  }
}
