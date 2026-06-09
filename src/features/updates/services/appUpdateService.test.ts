import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { openExternalUrl } from '../../../services/externalNavigation';

vi.mock('expo-constants', () => ({
  default: {
    nativeAppVersion: '1.0.0',
    expoConfig: {
      version: '1.0.0',
    },
  },
}));

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    exists = false;
    delete = vi.fn();

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
    }

    create = vi.fn();
  }

  class File {
    uri: string;
    exists = false;
    size = 0;
    contentUri: string;
    delete = vi.fn();

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
      this.contentUri = `content://${this.uri}`;
    }

    static createDownloadTask = vi.fn();
  }

  return {
    Directory,
    File,
    Paths: {
      cache: new Directory('file:///tmp'),
    },
  };
});

vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

vi.mock('../../../config/env', () => ({
  ENV: {
    updateGithubRepoUrl: 'https://github.com/zig-zag-zig/PawifyApp',
    updateGithubToken: null,
  },
}));

vi.mock('../../../services/externalNavigation', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('./androidApkInstaller', () => ({
  androidApkInstaller: {
    isAvailable: vi.fn(() => false),
    canRequestPackageInstalls: vi.fn(),
    openInstallPermissionSettings: vi.fn(),
    installApk: vi.fn(),
  },
}));

vi.mock('./updatePreferenceStorage', () => ({
  getUpdatePreference: vi.fn(),
  setUpdatePreference: vi.fn(),
}));

import { AppUpdateNoReleaseError, appUpdateService } from './appUpdateService';

function createFetchResponse(status: number, data: unknown = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

function createRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v1.0.0',
    name: 'First release',
    body: 'First release',
    published_at: '2026-05-27T19:26:53Z',
    html_url: 'https://github.com/zig-zag-zig/PawifyApp/releases/tag/v1.0.0',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'Pawify.apk',
        url: 'https://api.github.com/repos/zig-zag-zig/PawifyApp/releases/assets/431366461',
        browser_download_url: 'https://github.com/zig-zag-zig/PawifyApp/releases/download/v1.0.0/Pawify.apk',
        content_type: 'application/vnd.android.package-archive',
        size: 107525255,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  (Platform as { OS: string }).OS = 'android';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('appUpdateService', () => {
  it('falls back to the releases list when the latest endpoint returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(200, [createRelease()]));

    vi.stubGlobal('fetch', fetchMock);

    const result = await appUpdateService.checkForUpdate();

    expect(result.currentVersion).toBe('1.0.0');
    expect(result.isAvailable).toBe(false);
    expect(result.release.tagName).toBe('v1.0.0');
    expect(result.release.assetName).toBe('Pawify.apk');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/zig-zag-zig/PawifyApp/releases/latest',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/zig-zag-zig/PawifyApp/releases?per_page=10',
      expect.any(Object),
    );
  });

  it('uses a neutral no-release error when GitHub has no stable public release', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(200, [
        createRelease({ prerelease: true }),
      ]));

    vi.stubGlobal('fetch', fetchMock);

    await expect(appUpdateService.checkForUpdate())
      .rejects
      .toBeInstanceOf(AppUpdateNoReleaseError);
  });

  it('checks iOS releases for notes without exposing download or install actions', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const fetchMock = vi.fn().mockResolvedValueOnce(createFetchResponse(200, createRelease({
      tag_name: 'v1.0.1',
    })));

    vi.stubGlobal('fetch', fetchMock);

    const result = await appUpdateService.checkForUpdate();

    expect(appUpdateService.isInstallSupported()).toBe(false);
    expect(result.isAvailable).toBe(true);
    expect(result.release.assetName).toBeNull();
    expect(result.release.assetDownloadUrl).toBeNull();
    expect(result.release.canInstallInApp).toBe(false);
    expect(result.release.downloadLabel).toBe('Release Notes');

    await appUpdateService.downloadAndInstallUpdate(result.release);
    await appUpdateService.openUpdate(result.release);

    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});
