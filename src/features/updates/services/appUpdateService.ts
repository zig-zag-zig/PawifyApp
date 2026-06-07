import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ENV } from '../../../config/env';
import { openExternalUrl } from '../../../services/externalNavigation';
import { updateCopy } from '../domain/updateCopy';
import type { AppRelease, UpdateCheckResult, UpdateDownloadProgress } from '../model/types';
import { androidApkInstaller } from './androidApkInstaller';
import { getUpdatePreference, setUpdatePreference } from './updatePreferenceStorage';

type GitHubReleaseAsset = {
  name?: string;
  url?: string;
  browser_download_url?: string;
  content_type?: string;
  size?: number;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
};

type ParsedRepo = {
  owner: string;
  repo: string;
};

const GITHUB_API_VERSION = '2022-11-28';
const SKIPPED_RELEASE_TAG_KEY = 'app-update-skipped-release-tag';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const supportsInstallActions = (): boolean => Platform.OS === 'android';

export class AppUpdateNoReleaseError extends Error {
  constructor(message = updateCopy.errors.noPublicRelease) {
    super(message);
    this.name = 'AppUpdateNoReleaseError';
  }
}

function parseRepoUrl(repoUrl: string | null): ParsedRepo | null {
  if (!repoUrl) return null;

  const parsed = new URL(repoUrl);
  const [owner, rawRepo] = parsed.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, '');

  if (!owner || !repo) return null;

  return { owner, repo };
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split('+')[0];
}

function parseVersionParts(value: string): number[] | null {
  const normalized = normalizeVersion(value).split('-')[0];
  const parts = normalized.split('.');

  if (parts.length === 0 || parts.some(part => !/^\d+$/.test(part))) {
    return null;
  }

  return parts.map(part => Number.parseInt(part, 10));
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);

  if (!aParts || !bParts) {
    return normalizeVersion(a) === normalizeVersion(b) ? 0 : 1;
  }

  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function getCurrentVersion(): string {
  const constants = Constants as typeof Constants & { nativeAppVersion?: string | null };
  return constants.nativeAppVersion || Constants.expoConfig?.version || '0.0.0';
}

function getPreferredAsset(assets: GitHubReleaseAsset[] | undefined): GitHubReleaseAsset | null {
  if (!assets?.length) return null;

  if (supportsInstallActions()) {
    const apkAsset = assets.find(asset => asset.name?.toLowerCase().endsWith('.apk'));
    if (apkAsset) return apkAsset;
  }

  return supportsInstallActions()
    ? assets.find(asset => Boolean(asset.browser_download_url)) ?? null
    : null;
}

function getGitHubHeaders(accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'Cache-Control': 'no-cache',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };

  if (ENV.updateGithubToken) {
    headers.Authorization = `Bearer ${ENV.updateGithubToken}`;
  }

  return headers;
}

function getGitHubApiUrl(repo: ParsedRepo, path: string): string {
  const owner = encodeURIComponent(repo.owner);
  const repoName = encodeURIComponent(repo.repo);

  return `https://api.github.com/repos/${owner}/${repoName}${path}`;
}

function isStableRelease(release: GitHubRelease): boolean {
  return !release.draft && !release.prerelease;
}

function selectLatestStableRelease(releases: GitHubRelease[]): GitHubRelease | null {
  return releases.find(isStableRelease) ?? null;
}

async function fetchGitHubJson<T>(url: string): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number }> {
  const response = await fetch(url, { headers: getGitHubHeaders() });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  return {
    ok: true,
    status: response.status,
    data: await response.json() as T,
  };
}

function sanitizeAssetFileName(release: AppRelease): string {
  const fallback = `pawify-${release.version}.apk`;
  const fileName = release.assetName || fallback;
  const sanitized = fileName.replace(/[^a-z0-9._-]/gi, '-');

  return sanitized.toLowerCase().endsWith('.apk') ? sanitized : `${sanitized}.apk`;
}

function getDownloadDirectory(): string {
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!root) {
    throw new Error('File storage is not available on this device');
  }

  return `${root}updates/`;
}

function getDownloadHeaders(release: AppRelease): Record<string, string> {
  if (release.assetDownloadUrl?.startsWith('https://api.github.com/')) {
    return getGitHubHeaders('application/octet-stream');
  }

  const headers: Record<string, string> = {
    Accept: APK_MIME_TYPE,
  };

  if (ENV.updateGithubToken) {
    headers.Authorization = `Bearer ${ENV.updateGithubToken}`;
  }

  return headers;
}

function createProgress(
  stage: UpdateDownloadProgress['stage'],
  progress: number | null = null,
  bytesWritten: number | null = null,
  contentLength: number | null = null,
): UpdateDownloadProgress {
  return {
    stage,
    progress,
    bytesWritten,
    contentLength,
  };
}

function toAppRelease(release: GitHubRelease): AppRelease {
  const tagName = release.tag_name?.trim();
  const htmlUrl = release.html_url?.trim();
  if (!tagName || !htmlUrl) {
    throw new Error(updateCopy.errors.missingReleaseMetadata);
  }

  const preferredAsset = getPreferredAsset(release.assets);
  const downloadUrl = preferredAsset?.browser_download_url?.trim() || htmlUrl;
  const assetName = preferredAsset?.name?.trim() || null;
  const assetDownloadUrl = preferredAsset?.url?.trim() || preferredAsset?.browser_download_url?.trim() || null;
  const isAndroidApk = supportsInstallActions() && Boolean(assetName?.toLowerCase().endsWith('.apk'));

  return {
    tagName,
    version: normalizeVersion(tagName),
    name: release.name?.trim() || tagName,
    body: release.body?.trim() || 'No release notes were provided.',
    publishedAt: release.published_at || null,
    htmlUrl,
    downloadUrl,
    downloadLabel: isAndroidApk ? 'Install Update' : preferredAsset ? 'Update' : 'Release Notes',
    assetName,
    assetDownloadUrl,
    assetSizeBytes: typeof preferredAsset?.size === 'number' ? preferredAsset.size : null,
    canInstallInApp: isAndroidApk && Boolean(assetDownloadUrl),
  };
}

async function fetchLatestRelease(): Promise<AppRelease> {
  const repo = parseRepoUrl(ENV.updateGithubRepoUrl);
  if (!repo) {
    throw new Error(updateCopy.errors.sourceNotConfigured);
  }

  const latestResponse = await fetchGitHubJson<GitHubRelease>(
    getGitHubApiUrl(repo, '/releases/latest'),
  );

  if (latestResponse.ok) {
    return toAppRelease(latestResponse.data);
  }

  if (latestResponse.status !== 404) {
    throw new Error(`GitHub update check failed (${latestResponse.status})`);
  }

  const releasesResponse = await fetchGitHubJson<GitHubRelease[]>(
    getGitHubApiUrl(repo, '/releases?per_page=10'),
  );

  if (!releasesResponse.ok) {
    if (releasesResponse.status === 404) {
      throw new AppUpdateNoReleaseError();
    }

    throw new Error(`GitHub update check failed (${releasesResponse.status})`);
  }

  if (!Array.isArray(releasesResponse.data)) {
    throw new Error(updateCopy.errors.unexpectedReleaseResponse);
  }

  const fallbackRelease = selectLatestStableRelease(releasesResponse.data);
  if (!fallbackRelease) {
    throw new AppUpdateNoReleaseError();
  }

  return toAppRelease(fallbackRelease);
}

async function downloadAndInstallApk(
  release: AppRelease,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!supportsInstallActions()) {
    return;
  }

  if (!release.canInstallInApp || !release.assetDownloadUrl) {
    await openExternalUrl(release.downloadUrl || release.htmlUrl);
    return;
  }

  if (!androidApkInstaller.isAvailable()) {
    await openExternalUrl(release.downloadUrl || release.htmlUrl);
    return;
  }

  onProgress?.(createProgress('checking-permission'));
  const canInstallPackages = await androidApkInstaller.canRequestPackageInstalls();
  if (!canInstallPackages) {
    await androidApkInstaller.openInstallPermissionSettings();
    throw new Error(updateCopy.errors.installPermissionRequired);
  }

  const downloadDirectory = getDownloadDirectory();
  await FileSystem.makeDirectoryAsync(downloadDirectory, { intermediates: true });

  const fileUri = `${downloadDirectory}${sanitizeAssetFileName(release)}`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    release.assetDownloadUrl,
    fileUri,
    { headers: getDownloadHeaders(release) },
    (event) => {
      const expectedBytes = event.totalBytesExpectedToWrite > 0
        ? event.totalBytesExpectedToWrite
        : release.assetSizeBytes;
      const progress = expectedBytes
        ? Math.min(event.totalBytesWritten / expectedBytes, 1)
        : null;

      onProgress?.(createProgress(
        'downloading',
        progress,
        event.totalBytesWritten,
        expectedBytes,
      ));
    },
  );

  onProgress?.(createProgress('downloading', 0, 0, release.assetSizeBytes));

  const result = await download.downloadAsync();
  if (!result) {
    throw new Error(updateCopy.errors.downloadCancelled);
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Update download failed (${result.status})`);
  }

  onProgress?.(createProgress('opening-installer', 1, release.assetSizeBytes, release.assetSizeBytes));
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await androidApkInstaller.installApk(contentUri);
}

export const appUpdateService = {
  isConfigured: () => Boolean(parseRepoUrl(ENV.updateGithubRepoUrl)),
  isInstallSupported: supportsInstallActions,
  getCurrentVersion,
  getSkippedReleaseTag: async (): Promise<string | null> => {
    return getUpdatePreference(SKIPPED_RELEASE_TAG_KEY);
  },
  skipRelease: async (release: AppRelease): Promise<void> => {
    await setUpdatePreference(SKIPPED_RELEASE_TAG_KEY, release.tagName);
  },

  checkForUpdate: async (): Promise<UpdateCheckResult> => {
    const release = await fetchLatestRelease();
    const currentVersion = getCurrentVersion();

    return {
      currentVersion,
      isAvailable: compareVersions(release.version, currentVersion) > 0,
      release,
      checkedAt: Date.now(),
    };
  },

  openUpdate: async (release: AppRelease): Promise<void> => {
    if (!supportsInstallActions()) {
      return;
    }

    await openExternalUrl(release.downloadUrl || release.htmlUrl);
  },

  downloadAndInstallUpdate: downloadAndInstallApk,
};
