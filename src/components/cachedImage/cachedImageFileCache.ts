import { File, Paths } from 'expo-file-system';
import { ENV } from '../../config/env';
import {
  describeError,
  diagnosticLog,
  diagnosticWarn,
  elapsedSince,
  shortenString,
} from '../../utils/diagnostics';

type CachedImageDiagnosticPayload = Record<string, unknown>;

type ResolveCachedImageUriOptions = {
  cacheTimeoutRetryCountRef: { current: number };
  cleanUpCache: () => Promise<void>;
  downloadStartedAtRef: { current: number | null };
  getImageDiagnosticPayload: () => CachedImageDiagnosticPayload;
  prefixedCacheKey: string;
  remoteImageUrl: string;
  renderWhenReady: boolean;
  type: 'release' | 'profile';
  updateAccessTime: (cacheKey: string) => Promise<void>;
};

const CACHE_DOWNLOAD_TIMEOUT_MAX_RETRIES = ENV.imageCacheTimeoutMaxRetries;
const CACHE_DOWNLOAD_TIMEOUT_RETRY_BASE_DELAY_MS = ENV.imageCacheTimeoutRetryBaseDelayMs;

const getCachedImageFile = (cacheKey: string): File => new File(Paths.cache, cacheKey);

export const getCachedImageFileUri = (cacheKey: string): string => getCachedImageFile(cacheKey).uri;

export const deleteCachedImageFile = async (cacheKey: string): Promise<void> => {
  const file = getCachedImageFile(cacheKey);
  if (file.exists) {
    file.delete();
  }
};

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error) || typeof error.message !== 'string') {
    return false;
  }

  return error.message.toLowerCase().includes('timeout');
};

const wait = async (delayMs: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, delayMs));
};

export const getCacheKeyFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;

  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
  return `expo-cached-image-${hashHex}`;
};

export const resolveCachedImageUri = async (
  options: ResolveCachedImageUriOptions,
): Promise<string> => {
  const {
    cacheTimeoutRetryCountRef,
    cleanUpCache,
    downloadStartedAtRef,
    getImageDiagnosticPayload,
    prefixedCacheKey,
    remoteImageUrl,
    renderWhenReady,
    type,
    updateAccessTime,
  } = options;
  const file = getCachedImageFile(prefixedCacheKey);
  const fileUri = file.uri;
  const tempFile = getCachedImageFile(`${prefixedCacheKey}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const removeTempFile = async () => {
    if (tempFile.exists) {
      tempFile.delete();
    }
  };

  try {
    diagnosticLog('image', 'cache-resolve-start', {
      ...getImageDiagnosticPayload(),
      fileUri: shortenString(fileUri, 180),
    });
    const cachedFileSize = file.exists ? file.size : 0;

    if (cachedFileSize <= 0) {
      if (file.exists) {
        file.delete();
      }
      const downloadAttemptStartedAt = Date.now();
      diagnosticLog('image', 'download-start', {
        ...getImageDiagnosticPayload(),
      });
      const downloadedFile = await File.downloadFileAsync(remoteImageUrl, tempFile, { idempotent: true });
      const downloadedSize = downloadedFile.exists ? downloadedFile.size : 0;
      diagnosticLog('image', 'download-done', {
        ...getImageDiagnosticPayload(),
        downloadedSize,
        elapsedMs: elapsedSince(downloadAttemptStartedAt),
      });

      if (!downloadedFile.exists || downloadedSize <= 0) {
        throw new Error(`Invalid cached image download for ${prefixedCacheKey}`);
      }

      try {
        if (file.exists) {
          file.delete();
        }
        await tempFile.move(file, { overwrite: true });
      } catch (moveError) {
        const movedFileSize = file.exists ? file.size : 0;

        if (!file.exists || movedFileSize <= 0) {
          throw moveError;
        }

        await removeTempFile();
      }
    } else {
      diagnosticLog('image', 'cache-hit', {
        ...getImageDiagnosticPayload(),
        cachedFileSize,
      });
    }

    void updateAccessTime(prefixedCacheKey);
    void cleanUpCache();
    diagnosticLog('image', 'cache-ready', {
      ...getImageDiagnosticPayload(),
      renderWhenReady,
      elapsedMs: elapsedSince(downloadStartedAtRef.current),
    });

    return fileUri;
  } catch (error) {
    const nextRetryAttempt = cacheTimeoutRetryCountRef.current + 1;
    const shouldRetryTimeout =
      isTimeoutError(error) &&
      nextRetryAttempt <= CACHE_DOWNLOAD_TIMEOUT_MAX_RETRIES;

    if (shouldRetryTimeout) {
      cacheTimeoutRetryCountRef.current = nextRetryAttempt;
      const retryDelayMs = CACHE_DOWNLOAD_TIMEOUT_RETRY_BASE_DELAY_MS * nextRetryAttempt;
      diagnosticWarn('image', 'cache-timeout-retry', {
        ...getImageDiagnosticPayload(),
        retryAttempt: nextRetryAttempt,
        maxRetries: CACHE_DOWNLOAD_TIMEOUT_MAX_RETRIES,
        retryDelayMs,
        elapsedMs: elapsedSince(downloadStartedAtRef.current),
        error: describeError(error),
      });
      await removeTempFile();
      await wait(retryDelayMs);
      return await resolveCachedImageUri(options);
    }

    console.warn('image-cache: cache download failed, using remote URL', {
      type,
      cacheKey: prefixedCacheKey,
      renderWhenReady,
      reason: error instanceof Error ? error.message : String(error),
    });
    diagnosticWarn('image', 'cache-fallback', {
      ...getImageDiagnosticPayload(),
      renderWhenReady,
      elapsedMs: elapsedSince(downloadStartedAtRef.current),
      error: describeError(error),
    });
    await removeTempFile();

    return remoteImageUrl;
  }
};
