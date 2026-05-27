import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageStyle, StyleSheet, View } from 'react-native';
import { useCache } from '../../contexts/CacheContext';
import { PulsingPlaceholder } from './CachedImagePlaceholders';
import useTaskManager from '../../hooks/useTaskManager';
import { ENV } from '../../config/env';
import { getCacheKeyFromUrl, resolveCachedImageUri } from './cachedImageFileCache';
import {
  describeError,
  diagnosticLog,
  diagnosticWarn,
  elapsedSince,
  shortenString,
} from '../../utils/diagnostics';

const defaultReleaseImage = require('../../../assets/release.jpeg');
const defaultArtistImage = require('../../../assets/profile.jpeg');
const REMOTE_RELOAD_RETRY_DELAY_MS = ENV.imageRemoteReloadRetryDelayMs;

const normalizeRemoteImageUrl = (url: string | null | undefined): string | null => {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmedUrl = url.trim();
  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : null;
};

interface CachedImageComponentProps {
  imageUrl?: string | null;
  style?: ImageStyle;
  type: 'release' | 'profile';
  showSpinnerWhenNoImage?: boolean;
}

interface DownloadAndCacheImageOptions {
  renderWhenReady?: boolean;
}

const CachedImageComponentBase: React.FC<CachedImageComponentProps> = ({
  imageUrl,
  style,
  type,
  showSpinnerWhenNoImage = false,
}) => {
  const defaultImage = type === 'release' ? defaultReleaseImage : defaultArtistImage;
  const remoteImageUrl = normalizeRemoteImageUrl(imageUrl);
  const [activeRemoteImageUrl, setActiveRemoteImageUrl] = useState<string | null>(remoteImageUrl);
  const { updateAccessTime, cleanUpCache } = useCache();
  const [isLoading, setIsLoading] = useState(true);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const fallbackRetryAttemptedRef = useRef(false);
  const fallbackRetryInFlightRef = useRef(false);
  const cacheTimeoutRetryCountRef = useRef(0);
  const remoteLoadRetryAttemptedRef = useRef(false);
  const remoteReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadStartedAtRef = useRef<number | null>(null);
  const nativeLoadStartedAtRef = useRef<number | null>(null);
  const diagnosticImageIdRef = useRef(`image-${Math.random().toString(16).slice(2, 10)}`);
  const currentRemoteImageUrlRef = useRef(remoteImageUrl);
  const isMountedRef = useRef(true);
  const { tasks, addTask, removeTask, executeTask } = useTaskManager();

  currentRemoteImageUrlRef.current = remoteImageUrl;

  const canCommitImageState = () =>
    isMountedRef.current && currentRemoteImageUrlRef.current === remoteImageUrl;

  const renderDefaultImage = () => (
    <View
      pointerEvents="none"
      style={[style, imageStyles.cachedImageWrapper, { backgroundColor: '#1f2328' }]}
    >
      <Image
        source={defaultImage}
        style={imageStyles.cachedImageFill}
        resizeMode="contain"
      />
    </View>
  );

  const prefixedCacheKey = getCacheKeyFromUrl(remoteImageUrl);

  const getImageDiagnosticPayload = () => ({
    imageId: diagnosticImageIdRef.current,
    type,
    cacheKey: prefixedCacheKey,
    url: remoteImageUrl ? shortenString(remoteImageUrl, 180) : null,
    localUriKind: localUri
      ? (localUri === remoteImageUrl ? 'remote-fallback' : 'cache-file')
      : null,
  });

  const downloadAndCacheImage = async (options: DownloadAndCacheImageOptions = {}) => {
    const { renderWhenReady = true } = options;

    if (!remoteImageUrl || !prefixedCacheKey) {
      return;
    }

    downloadStartedAtRef.current = Date.now();
    try {
      const resolvedUri = await resolveCachedImageUri({
        cacheTimeoutRetryCountRef,
        cleanUpCache,
        downloadStartedAtRef,
        getImageDiagnosticPayload,
        prefixedCacheKey,
        remoteImageUrl,
        renderWhenReady,
        type,
        updateAccessTime,
      });

      if (renderWhenReady && canCommitImageState()) {
        setLocalUri(resolvedUri);
      }
    } finally {
      downloadStartedAtRef.current = null;
      if (renderWhenReady && canCommitImageState()) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    currentRemoteImageUrlRef.current = remoteImageUrl;
    fallbackRetryAttemptedRef.current = false;
    fallbackRetryInFlightRef.current = false;
    cacheTimeoutRetryCountRef.current = 0;
    remoteLoadRetryAttemptedRef.current = false;
    if (remoteReloadTimeoutRef.current) {
      clearTimeout(remoteReloadTimeoutRef.current);
      remoteReloadTimeoutRef.current = null;
    }
    setActiveRemoteImageUrl(remoteImageUrl);
    setLocalUri(null);
    if (remoteImageUrl) {
      diagnosticLog('image', 'source-changed', {
        imageId: diagnosticImageIdRef.current,
        type,
        cacheKey: prefixedCacheKey,
        url: shortenString(remoteImageUrl, 180),
        hasRemoteImageUrl: true,
      });
    }

    if (remoteImageUrl && prefixedCacheKey) {
      setIsLoading(true);
      const task = addTask(
        () => downloadAndCacheImage(),
        downloadAndCacheImage.name,
        {
          taskId: prefixedCacheKey,
          origin: `cached-image:${type}`,
          replayPolicy: 'both',
        }
      );
      setTaskId(task.id);
      executeTask(task);
    } else {
      setIsLoading(false);
      setTaskId(null);
    }
  }, [remoteImageUrl, prefixedCacheKey]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (remoteReloadTimeoutRef.current) {
        clearTimeout(remoteReloadTimeoutRef.current);
        remoteReloadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const checkTasks = async () => {
      if (tasks.length === 0) return;

      if (taskId) {
          const task = tasks.find((task) => task.id === taskId);
          if (task && (task.result !== undefined || task.error)) {
            if (task.error) {
              console.warn('image-cache: cache task failed', {
                type,
                taskId: task.id,
                reason: task.error instanceof Error ? task.error.message : String(task.error),
              });
              diagnosticWarn('image', 'cache-task-error', {
                ...getImageDiagnosticPayload(),
                taskId: task.id,
              error: describeError(task.error),
            });
          }

          removeTask(task.id);
          setTaskId(null);
        }
      }
    }

    checkTasks();
  }, [tasks]);

  useEffect(() => {
    if (!localUri || !isLoading) {
      return;
    }

    const pendingStartedAt = Date.now();
    const timeoutRef = setTimeout(() => {
      diagnosticWarn('image', 'native-load-still-pending', {
        ...getImageDiagnosticPayload(),
        elapsedMs: elapsedSince(pendingStartedAt),
        nativeLoadElapsedMs: elapsedSince(nativeLoadStartedAtRef.current),
      });
    }, 12000);

    return () => clearTimeout(timeoutRef);
  }, [localUri, isLoading, prefixedCacheKey, remoteImageUrl, type]);

  if (!remoteImageUrl) {
    if (imageUrl === undefined && showSpinnerWhenNoImage) {
      return <PulsingPlaceholder style={style} />;
    }

    return renderDefaultImage();
  }

  const isSwitchingRemoteImage = remoteImageUrl !== activeRemoteImageUrl;

  if (isSwitchingRemoteImage || (!localUri && isLoading)) {
    return <PulsingPlaceholder style={style} />;
  }

  if (!localUri && !isLoading) {
    return renderDefaultImage();
  }

  const handleImageLoadStart = () => {
    nativeLoadStartedAtRef.current = Date.now();
    diagnosticLog('image', 'native-load-start', {
      ...getImageDiagnosticPayload(),
    });
    setIsLoading(true);
  };

  const handleImageError = (error?: unknown) => {
    diagnosticWarn('image', 'native-load-error', {
      ...getImageDiagnosticPayload(),
      elapsedMs: elapsedSince(nativeLoadStartedAtRef.current),
      error: describeError(error),
    });
    if (!prefixedCacheKey) {
      setIsLoading(false);
      return;
    }

    const fileUri = `${FileSystem.cacheDirectory}${prefixedCacheKey}`;
    setIsLoading(false);

    if (localUri !== fileUri) {
      if (localUri === remoteImageUrl) {
        if (!remoteLoadRetryAttemptedRef.current) {
          remoteLoadRetryAttemptedRef.current = true;
          diagnosticWarn('image', 'remote-load-retry', {
            ...getImageDiagnosticPayload(),
            elapsedMs: elapsedSince(nativeLoadStartedAtRef.current),
          });
          setLocalUri(null);
          remoteReloadTimeoutRef.current = setTimeout(() => {
            if (canCommitImageState()) {
              setLocalUri(remoteImageUrl);
            }
            remoteReloadTimeoutRef.current = null;
          }, REMOTE_RELOAD_RETRY_DELAY_MS);
          nativeLoadStartedAtRef.current = null;
          return;
        }

        diagnosticWarn('image', 'remote-load-retry-exhausted', {
          ...getImageDiagnosticPayload(),
          elapsedMs: elapsedSince(nativeLoadStartedAtRef.current),
        });
      }

      setLocalUri(null);
      nativeLoadStartedAtRef.current = null;
      return;
    }

    void (async () => {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      if (canCommitImageState()) {
        setLocalUri(remoteImageUrl);
      }
    })();
    nativeLoadStartedAtRef.current = null;
  };

  const handleImageLoadEnd = () => {
    diagnosticLog('image', 'native-load-end', {
      ...getImageDiagnosticPayload(),
      elapsedMs: elapsedSince(nativeLoadStartedAtRef.current),
    });
    nativeLoadStartedAtRef.current = null;
    setIsLoading(false);

    if (localUri !== remoteImageUrl) {
      return;
    }

    if (fallbackRetryAttemptedRef.current || fallbackRetryInFlightRef.current) {
      return;
    }

    fallbackRetryAttemptedRef.current = true;
    fallbackRetryInFlightRef.current = true;
    diagnosticLog('image', 'fallback-cache-retry-start', {
      ...getImageDiagnosticPayload(),
    });

    void (async () => {
      try {
        await downloadAndCacheImage({ renderWhenReady: false });
      } finally {
        fallbackRetryInFlightRef.current = false;
      }
    })();
  };

  return (
    <View
      pointerEvents="none"
      style={[style, imageStyles.cachedImageWrapper, { backgroundColor: '#333' }]}
    >
      {localUri && (
        <Image
          source={{ uri: localUri }}
          style={imageStyles.cachedImageFill}
          resizeMode="cover"
          onLoadStart={handleImageLoadStart}
          onLoadEnd={handleImageLoadEnd}
          onError={handleImageError}
        />
      )}
    </View>
  );
};

export const CachedImageComponent = React.memo(CachedImageComponentBase);

const imageStyles = StyleSheet.create({
  cachedImageWrapper: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cachedImageFill: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
});
