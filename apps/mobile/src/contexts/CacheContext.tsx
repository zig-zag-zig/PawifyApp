import { createContext, useContext, useState } from 'react';
import { useFileCacheMaintenance } from '../services/cache/useFileCacheMaintenance';

type CacheValueMap = Record<string, string | null | undefined>;

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
}

const CacheContext = createContext<CacheContextType | null>(null);

export const CacheProvider = ({ children }: { children: React.ReactNode }) => {
    const { updateAccessTime, cleanUpCache } = useFileCacheMaintenance();
    const [releaseTracksLyrics, setReleaseTracksLyrics] = useState<CacheValueMap>({});
    const [artistProfileImages, setArtistProfileImages] = useState<CacheValueMap>({});
    const [releaseGroupCovers, setReleaseGroupCovers] = useState<CacheValueMap>({});
    const [releaseGroupReleaseCovers, setReleaseGroupReleaseCovers] = useState<CacheValueMap>({});

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
        }}>
            {children}
        </CacheContext.Provider>
    );
};

export const useCache = () => {
    const context = useContext(CacheContext);
    if (!context) {
        throw new Error('useCache must be used within a CacheProvider');
    }
    return context;
};
