export type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'not_found' | 'error';

export type UpdateDownloadStage =
  | 'checking-permission'
  | 'downloading'
  | 'opening-installer';

export type UpdateDownloadProgress = {
  stage: UpdateDownloadStage;
  progress: number | null;
  bytesWritten: number | null;
  contentLength: number | null;
};

export type AppRelease = {
  tagName: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string | null;
  htmlUrl: string;
  downloadUrl: string;
  downloadLabel: string;
  assetName: string | null;
  assetDownloadUrl: string | null;
  assetSizeBytes: number | null;
  canInstallInApp: boolean;
};

export type UpdateCheckResult = {
  currentVersion: string;
  isAvailable: boolean;
  release: AppRelease;
  checkedAt: number;
};

export type UpdateCheckOptions = {
  silent?: boolean;
  showModalOnUpdate?: boolean;
  showModalWhenCurrent?: boolean;
  respectSkippedVersion?: boolean;
};
