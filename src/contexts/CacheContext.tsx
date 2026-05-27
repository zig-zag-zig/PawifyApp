import * as FileSystem from 'expo-file-system/legacy';
import { createContext, useContext, useEffect, useRef, useState } from "react";

interface CacheContextType {
    updateAccessTime: (file: string) => Promise<void>;
    cleanUpCache: () => Promise<void>;
    releaseTracksLyrics: CacheValueMap;
    setReleaseTracksLyrics: (value: React.SetStateAction<CacheValueMap>) => void;
    artistProfileImages: CacheValueMap;
    setArtistProfileImages: (value: React.SetStateAction<CacheValueMap>) => void;
    releaseGroupCovers: CacheValueMap;
    setReleaseGroupCovers: (value: React.SetStateAction<CacheValueMap>) => void;
    releaseGroupReleaseCovers: CacheValueMap;
    setReleaseGroupReleaseCovers: (value: React.SetStateAction<CacheValueMap>) => void;
    // Backward-compatible aliases while feature hooks migrate.
    lyrics: CacheValueMap;
    setLyrics: (value: React.SetStateAction<CacheValueMap>) => void;
    profilePictures: CacheValueMap;
    setProfilePictures: (value: React.SetStateAction<CacheValueMap>) => void;
}

type CacheValueMap = Record<string, string | null | undefined>;

const CacheContext = createContext<CacheContextType | null>(null);

export const CacheProvider = ({ children }: { children: React.ReactNode }) => {
    const CACHE_DIR = FileSystem.cacheDirectory;
    const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB
    const MAX_CACHE_AGE_DAYS = 60; // Delete cached images older than 60 days
    const CACHE_FILE_PREFIX = 'expo-cached-image-';
    const ACCESS_TIMES_FILE = CACHE_DIR ? `${CACHE_DIR}access-times.json` : null;
    const [releaseTracksLyrics, setReleaseTracksLyrics] = useState<CacheValueMap>({});
    const [artistProfileImages, setArtistProfileImages] = useState<CacheValueMap>({});
    const [releaseGroupCovers, setReleaseGroupCovers] = useState<CacheValueMap>({});
    const [releaseGroupReleaseCovers, setReleaseGroupReleaseCovers] = useState<CacheValueMap>({});
    const cleanupInFlightRef = useRef(false);
    const lastCleanupStartedAtRef = useRef(0);
    const pendingAccessTimesRef = useRef<Record<string, number>>({});
    const accessTimeFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const accessTimeFlushInFlightRef = useRef(false);
    const cleanupMinIntervalMs = 30_000;
    const accessTimeFlushDelayMs = 750;

    useEffect(() => {
        const initCacheCleanup = async () => {
            await initializeCacheCleanup();
        };
        initCacheCleanup();
    }, []);

    const cleanUpCache = async (skipSizeCheck = false): Promise<void> => {
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

        if (!CACHE_DIR || !ACCESS_TIMES_FILE) {
            console.warn('cache: cleanup skipped (cache directory or access-times file unavailable)');
            cleanupInFlightRef.current = false;
            return;
        }

        if (!skipSizeCheck && accessTimeFlushInFlightRef.current) {
            cleanupInFlightRef.current = false;
            return;
        }

        try {
            let accessTimes: Record<string, number> = {};
            try {
                const accessTimesData = await FileSystem.readAsStringAsync(ACCESS_TIMES_FILE);
                accessTimes = JSON.parse(accessTimesData);
            } catch (error) {
                console.warn('cache: read access-times file failed', error);
            }

            let accessTimesChanged = false;
            const pendingAccessTimes = pendingAccessTimesRef.current;
            const pendingAccessTimeCount = Object.keys(pendingAccessTimes).length;
            if (pendingAccessTimeCount > 0) {
                pendingAccessTimesRef.current = {};
                if (accessTimeFlushTimeoutRef.current) {
                    clearTimeout(accessTimeFlushTimeoutRef.current);
                    accessTimeFlushTimeoutRef.current = null;
                }
                Object.assign(accessTimes, pendingAccessTimes);
                accessTimesChanged = true;
            }

            const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
            const fileDetails = await Promise.all(
                files.map(async (file) => {
                    if (file.startsWith(CACHE_FILE_PREFIX)) {
                        const filePath = `${CACHE_DIR}${file}`;
                        const fileInfo = await FileSystem.getInfoAsync(filePath);
                        const size = fileInfo.exists ? fileInfo.size : 0;

                        if (fileInfo.exists && size > 0) {
                            return {
                                file,
                                size,
                                accessTime: accessTimes[file] || 0,
                            };
                        }

                        await FileSystem.deleteAsync(filePath, { idempotent: true });
                        if (accessTimes[file] !== undefined) {
                            delete accessTimes[file];
                            accessTimesChanged = true;
                        }
                    }
                    return null;
                })
            );

            const validFiles = fileDetails.filter((file) => file !== null) as {
                file: string;
                size: number;
                accessTime: number;
            }[];

            // Clean up orphaned access time entries (entries without corresponding files)
            const validFileSet = new Set(validFiles.map(f => f.file));
            for (const key of Object.keys(accessTimes)) {
                if (key.startsWith(CACHE_FILE_PREFIX) && !validFileSet.has(key)) {
                    delete accessTimes[key];
                    accessTimesChanged = true;
                }
            }

            // Clean up files older than MAX_CACHE_AGE_DAYS
            const maxAgeTimestamp = Date.now() - (MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000);
            const filesToDeleteForAge = validFiles.filter(f => f.accessTime < maxAgeTimestamp);
            for (const file of filesToDeleteForAge) {
                await FileSystem.deleteAsync(`${CACHE_DIR}${file.file}`, { idempotent: true });
                if (accessTimes[file.file] !== undefined) {
                    delete accessTimes[file.file];
                    accessTimesChanged = true;
                }
            }

            // Remove age-deleted files from validFiles before size-based eviction
            const filesToDeleteForAgeSet = new Set(filesToDeleteForAge.map(f => f.file));
            const remainingFiles = validFiles.filter(f => !filesToDeleteForAgeSet.has(f.file));

            remainingFiles.sort((a, b) => a.accessTime - b.accessTime);

            let totalSize = remainingFiles.reduce((sum, file) => sum + file.size, 0);

            // If skipSizeCheck is true, skip the size-based eviction (useful for orphan cleanup)
            if (skipSizeCheck) {
                if (accessTimesChanged) {
                    await FileSystem.writeAsStringAsync(ACCESS_TIMES_FILE, JSON.stringify(accessTimes));
                }
                return;
            }

            while (totalSize > MAX_CACHE_SIZE && remainingFiles.length > 0) {
                const leastRecentlyAccessedFile = remainingFiles.shift();
                if (leastRecentlyAccessedFile) {
                    await FileSystem.deleteAsync(`${CACHE_DIR}${leastRecentlyAccessedFile.file}`, { idempotent: true });
                    totalSize -= leastRecentlyAccessedFile.size;

                    if (accessTimes[leastRecentlyAccessedFile.file] !== undefined) {
                        delete accessTimes[leastRecentlyAccessedFile.file];
                        accessTimesChanged = true;
                    }
                }
            }

            if (accessTimesChanged) {
                await FileSystem.writeAsStringAsync(ACCESS_TIMES_FILE, JSON.stringify(accessTimes));
            }
        } catch (error) {
            console.error('cache: cleanup failed', error);
        } finally {
            if (!skipSizeCheck) {
                cleanupInFlightRef.current = false;
            }
        }
    };

    const initializeCacheCleanup = async (): Promise<void> => {
        if (!CACHE_DIR) {
            console.warn('cache: initialization skipped (cache directory unavailable)');
            return;
        }

        try {
            await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

            if (ACCESS_TIMES_FILE) {
                const fileInfo = await FileSystem.getInfoAsync(ACCESS_TIMES_FILE);
                if (!fileInfo.exists) {
                    await FileSystem.writeAsStringAsync(ACCESS_TIMES_FILE, JSON.stringify({}));
                }
            }

            await cleanUpCache();
        } catch (error) {
            console.error('cache: initialization failed', error);
        }
    };

    const flushAccessTimes = async (): Promise<void> => {
        if (!CACHE_DIR || !ACCESS_TIMES_FILE) {
            console.warn('cache: update access time skipped (cache directory or access-times file unavailable)');
            return;
        }

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
            let accessTimes: Record<string, number> = {};
            try {
                const accessTimesData = await FileSystem.readAsStringAsync(ACCESS_TIMES_FILE);
                accessTimes = JSON.parse(accessTimesData);
            } catch (error) {
                console.warn('cache: read access-times file failed', error);
            }

            Object.assign(accessTimes, pendingAccessTimes);

            await FileSystem.writeAsStringAsync(ACCESS_TIMES_FILE, JSON.stringify(accessTimes));
        } catch (error) {
            console.error('cache: update access time failed', error);
        } finally {
            accessTimeFlushInFlightRef.current = false;
            if (Object.keys(pendingAccessTimesRef.current).length > 0) {
                scheduleAccessTimeFlush();
            }
        }
    };

    const scheduleAccessTimeFlush = () => {
        if (accessTimeFlushTimeoutRef.current) {
            return;
        }

        accessTimeFlushTimeoutRef.current = setTimeout(() => {
            accessTimeFlushTimeoutRef.current = null;
            void flushAccessTimes();
        }, accessTimeFlushDelayMs);
    };

    const updateAccessTime = async (file: string): Promise<void> => {
        if (!CACHE_DIR || !ACCESS_TIMES_FILE) {
            console.warn('cache: update access time skipped (cache directory or access-times file unavailable)');
            return;
        }

        pendingAccessTimesRef.current[file] = Date.now();
        scheduleAccessTimeFlush();
    };

    return (
        <CacheContext.Provider value={{
            updateAccessTime,
            cleanUpCache,
            releaseTracksLyrics,
            setReleaseTracksLyrics,
            artistProfileImages,
            setArtistProfileImages,
            releaseGroupCovers,
            setReleaseGroupCovers,
            releaseGroupReleaseCovers,
            setReleaseGroupReleaseCovers,
            lyrics: releaseTracksLyrics,
            setLyrics: setReleaseTracksLyrics,
            profilePictures: artistProfileImages,
            setProfilePictures: setArtistProfileImages,
        }}>
            {children}
        </CacheContext.Provider>
    );
};

export const useCache = () => useContext(CacheContext)!;
