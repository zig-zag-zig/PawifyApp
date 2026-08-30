import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
    describeIds,
    describeNullableStringMap,
    diagnosticLog,
} from '../../../utils/diagnostics';
import { mergeNullableStringMaps, type NullableStringMap } from '../../../utils/nullableMaps';

type CacheSetter = Dispatch<SetStateAction<NullableStringMap>>;

interface UseArtistPageCacheMergersOptions {
    artistIdRef: RefObject<string | undefined>;
    setArtistProfileImages: CacheSetter;
    setReleaseGroupCovers: CacheSetter;
}

const hasNullableMapChanges = (
    currentValues: NullableStringMap,
    incomingValues: NullableStringMap
): boolean => {
    return Object.entries(incomingValues).some(([id, value]) => {
        if (value === undefined) {
            return false;
        }

        if (value === null && currentValues[id] !== undefined) {
            return false;
        }

        return currentValues[id] !== value;
    });
};

export const useArtistPageCacheMergers = ({
    artistIdRef,
    setArtistProfileImages,
    setReleaseGroupCovers,
}: UseArtistPageCacheMergersOptions) => {
    const mergeProfileImagesWithDiagnostics = useCallback((
        incomingImages: NullableStringMap,
        expectedArtistIds: string[],
        reason: string
    ) => {
        setArtistProfileImages(prev => {
            const hasChanges = hasNullableMapChanges(prev, incomingImages);
            const mergedImages = hasChanges
                ? mergeNullableStringMaps(prev, incomingImages)
                : prev;

            diagnosticLog('artist-page', 'profile-image-cache-merge', {
                currentArtistId: artistIdRef.current,
                reason,
                changed: hasChanges,
                expectedArtistIds: describeIds(expectedArtistIds),
                incoming: describeNullableStringMap(incomingImages, expectedArtistIds),
                before: describeNullableStringMap(prev, expectedArtistIds),
                after: describeNullableStringMap(mergedImages, expectedArtistIds),
            });
            return mergedImages;
        });
    }, [artistIdRef, setArtistProfileImages]);

    const mergeReleaseGroupCoversWithDiagnostics = useCallback((
        incomingCovers: NullableStringMap,
        expectedReleaseGroupIds: string[],
        reason: string
    ) => {
        setReleaseGroupCovers(prev => {
            const hasChanges = hasNullableMapChanges(prev, incomingCovers);
            const mergedCovers = hasChanges
                ? {
                    ...prev,
                    ...incomingCovers,
                }
                : prev;
            diagnosticLog('artist-page', 'release-group-cover-cache-merge', {
                currentArtistId: artistIdRef.current,
                reason,
                changed: hasChanges,
                expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                incoming: describeNullableStringMap(incomingCovers, expectedReleaseGroupIds),
                before: describeNullableStringMap(prev, expectedReleaseGroupIds),
                after: describeNullableStringMap(mergedCovers, expectedReleaseGroupIds),
            });
            return mergedCovers;
        });
    }, [artistIdRef, setReleaseGroupCovers]);

    return {
        mergeProfileImagesWithDiagnostics,
        mergeReleaseGroupCoversWithDiagnostics,
    };
};
