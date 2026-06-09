import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef } from 'react';

const CACHE_DIR = Paths.cache;
const MAX_CACHE_SIZE = 200 * 1024 * 1024;
const MAX_CACHE_AGE_DAYS = 60;
const CACHE_FILE_PREFIX = 'expo-cached-image-';
const ACCESS_TIMES_FILE = new File(CACHE_DIR, 'access-times.json');
const cleanupMinIntervalMs = 30_000;
const accessTimeFlushDelayMs = 750;

type CacheFileDetails = {
  file: string;
  size: number;
  accessTime: number;
};

function deleteFileIfExists(file: File): void {
  if (file.exists) {
    file.delete();
  }
}

function getCacheFile(fileName: string): File {
  return new File(CACHE_DIR, fileName);
}

function writeAccessTimes(accessTimes: Record<string, number>): void {
  if (!ACCESS_TIMES_FILE.exists) {
    ACCESS_TIMES_FILE.create({ intermediates: true, overwrite: true });
  }
  ACCESS_TIMES_FILE.write(JSON.stringify(accessTimes));
}

async function readAccessTimes(): Promise<Record<string, number>> {
  if (!ACCESS_TIMES_FILE.exists) {
    return {};
  }

  try {
    const accessTimesData = await ACCESS_TIMES_FILE.text();
    return JSON.parse(accessTimesData);
  } catch (error) {
    console.warn('cache: read access-times file failed', error);
    return {};
  }
}

export function useFileCacheMaintenance() {
  const cleanupInFlightRef = useRef(false);
  const lastCleanupStartedAtRef = useRef(0);
  const pendingAccessTimesRef = useRef<Record<string, number>>({});
  const accessTimeFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTimeFlushInFlightRef = useRef(false);

  const flushAccessTimes = useCallback(async (): Promise<void> => {
    if (accessTimeFlushInFlightRef.current) {
      return;
    }

    const pendingAccessTimes = pendingAccessTimesRef.current;
    pendingAccessTimesRef.current = {};
    if (Object.keys(pendingAccessTimes).length === 0) {
      return;
    }

    accessTimeFlushInFlightRef.current = true;

    try {
      const accessTimes = await readAccessTimes();
      Object.assign(accessTimes, pendingAccessTimes);
      writeAccessTimes(accessTimes);
    } catch (error) {
      console.error('cache: update access time failed', error);
    } finally {
      accessTimeFlushInFlightRef.current = false;
      if (Object.keys(pendingAccessTimesRef.current).length > 0) {
        scheduleAccessTimeFlush();
      }
    }
  }, []);

  const scheduleAccessTimeFlush = useCallback(() => {
    if (accessTimeFlushTimeoutRef.current) {
      return;
    }

    accessTimeFlushTimeoutRef.current = setTimeout(() => {
      accessTimeFlushTimeoutRef.current = null;
      void flushAccessTimes();
    }, accessTimeFlushDelayMs);
  }, [flushAccessTimes]);

  const cleanUpCache = useCallback(async (skipSizeCheck = false): Promise<void> => {
    if (!skipSizeCheck) {
      const now = Date.now();
      if (
        cleanupInFlightRef.current ||
        now - lastCleanupStartedAtRef.current < cleanupMinIntervalMs
      ) {
        return;
      }

      cleanupInFlightRef.current = true;
      lastCleanupStartedAtRef.current = now;
    }

    if (!skipSizeCheck && accessTimeFlushInFlightRef.current) {
      cleanupInFlightRef.current = false;
      return;
    }

    try {
      CACHE_DIR.create({ intermediates: true, idempotent: true });
      const accessTimes = await readAccessTimes();
      let accessTimesChanged = false;
      const pendingAccessTimes = pendingAccessTimesRef.current;
      if (Object.keys(pendingAccessTimes).length > 0) {
        pendingAccessTimesRef.current = {};
        if (accessTimeFlushTimeoutRef.current) {
          clearTimeout(accessTimeFlushTimeoutRef.current);
          accessTimeFlushTimeoutRef.current = null;
        }
        Object.assign(accessTimes, pendingAccessTimes);
        accessTimesChanged = true;
      }

      const files = CACHE_DIR.list();
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          if (!(file instanceof File) || !file.name.startsWith(CACHE_FILE_PREFIX)) {
            return null;
          }

          const size = file.exists ? file.size : 0;

          if (file.exists && size > 0) {
            return {
              file: file.name,
              size,
              accessTime: accessTimes[file.name] || 0,
            };
          }

          deleteFileIfExists(file);
          if (accessTimes[file.name] !== undefined) {
            delete accessTimes[file.name];
            accessTimesChanged = true;
          }
          return null;
        })
      );

      const validFiles = fileDetails.filter((file): file is CacheFileDetails => file !== null);
      const validFileSet = new Set(validFiles.map(f => f.file));
      for (const key of Object.keys(accessTimes)) {
        if (key.startsWith(CACHE_FILE_PREFIX) && !validFileSet.has(key)) {
          delete accessTimes[key];
          accessTimesChanged = true;
        }
      }

      const maxAgeTimestamp = Date.now() - (MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000);
      const filesToDeleteForAge = validFiles.filter(f => f.accessTime < maxAgeTimestamp);
      for (const file of filesToDeleteForAge) {
        deleteFileIfExists(getCacheFile(file.file));
        if (accessTimes[file.file] !== undefined) {
          delete accessTimes[file.file];
          accessTimesChanged = true;
        }
      }

      const filesToDeleteForAgeSet = new Set(filesToDeleteForAge.map(f => f.file));
      const remainingFiles = validFiles
        .filter(f => !filesToDeleteForAgeSet.has(f.file))
        .sort((a, b) => a.accessTime - b.accessTime);

      let totalSize = remainingFiles.reduce((sum, file) => sum + file.size, 0);

      if (!skipSizeCheck) {
        while (totalSize > MAX_CACHE_SIZE && remainingFiles.length > 0) {
          const leastRecentlyAccessedFile = remainingFiles.shift();
          if (!leastRecentlyAccessedFile) {
            continue;
          }

          deleteFileIfExists(getCacheFile(leastRecentlyAccessedFile.file));
          totalSize -= leastRecentlyAccessedFile.size;
          if (accessTimes[leastRecentlyAccessedFile.file] !== undefined) {
            delete accessTimes[leastRecentlyAccessedFile.file];
            accessTimesChanged = true;
          }
        }
      }

      if (accessTimesChanged) {
        writeAccessTimes(accessTimes);
      }
    } catch (error) {
      console.error('cache: cleanup failed', error);
    } finally {
      if (!skipSizeCheck) {
        cleanupInFlightRef.current = false;
      }
    }
  }, [flushAccessTimes]);

  const initializeCacheCleanup = useCallback(async (): Promise<void> => {
    try {
      CACHE_DIR.create({ intermediates: true, idempotent: true });

      if (!ACCESS_TIMES_FILE.exists) {
        writeAccessTimes({});
      }

      await cleanUpCache();
    } catch (error) {
      console.error('cache: initialization failed', error);
    }
  }, [cleanUpCache]);

  const updateAccessTime = useCallback(async (file: string): Promise<void> => {
    pendingAccessTimesRef.current[file] = Date.now();
    scheduleAccessTimeFlush();
  }, [scheduleAccessTimeFlush]);

  useEffect(() => {
    void initializeCacheCleanup();
  }, [initializeCacheCleanup]);

  useEffect(() => {
    return () => {
      if (accessTimeFlushTimeoutRef.current) {
        clearTimeout(accessTimeFlushTimeoutRef.current);
      }
    };
  }, []);

  return {
    updateAccessTime,
    cleanUpCache,
  };
}
