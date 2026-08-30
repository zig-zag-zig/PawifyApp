import { updateCopy } from '../domain/updateCopy';
import type { UpdateDownloadProgress } from '../model/types';

export function formatPublishedDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBytes(value: number | null): string | null {
  if (!value || value <= 0) return null;

  const mb = value / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;

  return `${Math.round(value / 1024)} KB`;
}

export function getProgressLabel(progress: UpdateDownloadProgress | null): string {
  switch (progress?.stage) {
    case 'checking-permission':
      return updateCopy.progress.checkingPermission;
    case 'downloading':
      return updateCopy.progress.downloading;
    case 'opening-installer':
      return updateCopy.progress.openingInstaller;
    default:
      return updateCopy.progress.preparing;
  }
}
