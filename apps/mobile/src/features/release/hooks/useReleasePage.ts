import { RouteProp, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { Release } from '@pawify/shared';
import { openExternalUrl } from '../../../services/externalNavigation';
import { isApiCallError } from '../../../services/apiErrors';
import {
    extractArtistProfileImages,
    extractReleaseGroupReleaseCovers,
    extractReleaseTrackLyrics,
} from '../../../utils/taskResultMaps';
import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import type { ReleaseResponse } from '../../../types/apiTypes';
import { RootStackParamList } from '../../../types/navigation';
import { useReleaseApi } from '../api/releaseApi';
import {
    collectArtistImagesForRelease,
    collectTrackLyricsForRelease,
} from '../domain/releaseEnrichment';
import type { ReleasePageController, ReleasePageUiState } from '../model/types';
import { createInitialReleaseState, releaseReducer } from '../state/releaseReducer';

type ReleaseRouteProp = RouteProp<RootStackParamList, 'Release'>;

function collectTrackIds(release: Release): string[] {
    const trackIds: string[] = [];
    release.media.forEach(media => {
        media.tracks?.forEach(track => {
            trackIds.push(track.id);
        });
    });
    return trackIds;
}

function collectArtistIds(release: Release): string[] {
    const artistIds = new Set<string>();
    release['artist-credit'].forEach(artist => {
        artistIds.add(artist.id);
    });
    release.media.forEach(media => {
        media.tracks?.forEach(track => {
            track['artist-credit'].forEach(artist => {
                artistIds.add(artist.id);
            });
        });
    });
    return [...artistIds];
}

/**
 * One request loads the release, all media/tracks and persisted enrichment state.
 *
 * There is no separate track request or track-loading phase. Lyrics and artist
 * images remain progressive per-item enrichment; their results update maps only,
 * never the whole release object or the clearly selected track.
 */
export function useReleasePage(): ReleasePageController {
    const route = useRoute<ReleaseRouteProp>();
    const releaseId = route.params.releaseId;
    const {
        releaseTracksLyrics,
        setReleaseTracksLyrics,
        artistProfileImages,
        setArtistProfileImages
    } = useCache();
    const { getRelease, waitForTaskResultById } = useReleaseApi();
    const [state, dispatch] = useReducer(
        releaseReducer,
        undefined,
        createInitialReleaseState
    );
    const releaseTracksLyricsRef = useRef(releaseTracksLyrics);
    const artistProfileImagesRef = useRef(artistProfileImages);
    const generationRef = useRef(0);

    useEffect(() => {
        releaseTracksLyricsRef.current = releaseTracksLyrics;
        artistProfileImagesRef.current = artistProfileImages;
    }, [artistProfileImages, releaseTracksLyrics]);

    const resolveEnrichment = useCallback(
        (release: Release, response: ReleaseResponse, generation: number) => {
            const isCurrent = () => generationRef.current === generation;
            const immediateTrackLyrics = normalizeNullableStringMap(response.trackLyrics);
            const immediateProfileImages = normalizeNullableStringMap(response.profileImages);

            setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, immediateTrackLyrics));
            setArtistProfileImages(prev => mergeNullableStringMaps(prev, immediateProfileImages));

            const mergedTrackLyrics = mergeNullableStringMaps(
                collectTrackLyricsForRelease(release, releaseTracksLyricsRef.current),
                immediateTrackLyrics
            );
            const mergedArtistImages = mergeNullableStringMaps(
                collectArtistImagesForRelease(release, artistProfileImagesRef.current),
                immediateProfileImages
            );

            const pendingLyricTrackIds = response.lyricsTaskId
                ? collectTrackIds(release).filter(trackId => mergedTrackLyrics[trackId] === undefined)
                : [];
            const pendingArtistImageIds = response.profileImageTaskId
                ? collectArtistIds(release).filter(artistId => mergedArtistImages[artistId] === undefined)
                : [];

            if (isCurrent()) {
                dispatch({
                    type: 'releaseLoaded',
                    release,
                    trackLyrics: mergedTrackLyrics,
                    artistProfileImages: mergedArtistImages,
                    pendingLyricTrackIds,
                    pendingArtistImageIds,
                });
            }

            const recreateEnrichment = async (): Promise<ReleaseResponse> => {
                const replayed = await getRelease(releaseId);
                setReleaseTracksLyrics(prev =>
                    mergeNullableStringMaps(prev, normalizeNullableStringMap(replayed.trackLyrics))
                );
                setArtistProfileImages(prev =>
                    mergeNullableStringMaps(prev, normalizeNullableStringMap(replayed.profileImages))
                );
                return replayed;
            };

            const resolveLyricsTask = async () => {
                let nextTrackLyrics = mergedTrackLyrics;
                await resolveNullableTaskMap({
                    taskId: response.lyricsTaskId,
                    expectedIds: pendingLyricTrackIds,
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractReleaseTrackLyrics,
                    onResolvedValues: (trackLyrics, resolvedTrackIds) => {
                        if (!isCurrent()) {
                            return;
                        }

                        setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, trackLyrics));
                        nextTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, trackLyrics);

                        dispatch({
                            type: 'lyricsLoadingFinished',
                            trackLyrics: nextTrackLyrics,
                            resolvedLyricTrackIds: resolvedTrackIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve lyrics task result failed', error);
                    },
                    recreateTask: async () => (await recreateEnrichment()).lyricsTaskId,
                    recreateTaskDescription: 'getRelease.lyricsTaskId',
                });
            };

            const resolveReleaseCoverTask = async () => {
                await resolveNullableTaskMap({
                    taskId: response.releaseCoverTaskId,
                    expectedIds: [release.id],
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractReleaseGroupReleaseCovers,
                    onResolvedValues: covers => {
                        if (!isCurrent()) {
                            return;
                        }
                        const coverUrl = covers[release.id];
                        if (coverUrl !== undefined) {
                            dispatch({ type: 'releaseCoverResolved', coverUrl });
                        }
                    },
                    onError: error => {
                        console.error('release-page: resolve release cover task failed', error);
                    },
                    shouldFillMissingOnCompleted: () => false,
                    shouldFillMissingOnError: false,
                    shouldFillMissingOnNonCompleted: false,
                    recreateTask: async () => (await recreateEnrichment()).releaseCoverTaskId,
                    recreateTaskDescription: 'getRelease.releaseCoverTaskId',
                });
            };

            const resolveArtistImageTask = async () => {
                let nextArtistImages = mergedArtistImages;
                await resolveNullableTaskMap({
                    taskId: response.profileImageTaskId,
                    expectedIds: pendingArtistImageIds,
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (artistImages, resolvedArtistIds) => {
                        if (!isCurrent()) {
                            return;
                        }

                        setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistImages));
                        nextArtistImages = mergeNullableStringMaps(nextArtistImages, artistImages);

                        dispatch({
                            type: 'artistImagesLoadingFinished',
                            artistProfileImages: nextArtistImages,
                            resolvedArtistImageIds: resolvedArtistIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve artist image task result failed', error);
                    },
                    recreateTask: async () => (await recreateEnrichment()).profileImageTaskId,
                    recreateTaskDescription: 'getRelease.profileImageTaskId',
                });
            };

            void resolveLyricsTask();
            void resolveArtistImageTask();
            void resolveReleaseCoverTask();
        },
        [
            getRelease,
            releaseId,
            setArtistProfileImages,
            setReleaseTracksLyrics,
            waitForTaskResultById,
        ],
    );

    useEffect(() => {
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        let isCancelled = false;
        const isCurrent = () => !isCancelled && generationRef.current === generation;

        const loadRelease = async () => {
            dispatch({ type: 'releaseLoadStarted' });

            if (!releaseId) {
                dispatch({ type: 'releaseLoadFailed', notFound: true });
                return;
            }

            try {
                const response = await getRelease(releaseId);
                if (!isCurrent()) {
                    return;
                }

                resolveEnrichment(response.release, response, generation);
            } catch (error) {
                console.error('release-page: fetch release payload failed', error);
                if (isCurrent()) {
                    dispatch({
                        type: 'releaseLoadFailed',
                        notFound: isApiCallError(error) && error.statusCode === 404,
                    });
                }
            }
        };

        void loadRelease();

        return () => {
            isCancelled = true;
            generationRef.current += 1;
        };
    }, [getRelease, releaseId, resolveEnrichment]);

    const uiState: ReleasePageUiState = {
        release: state.release,
        selectedSong: state.selectedSong,
        trackLyrics: state.trackLyrics,
        artistProfileImages: state.artistProfileImages,
        pendingLyricTrackIds: state.pendingLyricTrackIds,
        pendingArtistImageIds: state.pendingArtistImageIds,
        loadingLyrics: state.loadingLyrics,
        releaseExists: state.releaseExists,
        checkingExistence: state.checkingExistence,
        loadFailed: state.loadFailed,
    };

    return {
        state: uiState,
        onSongPressed: track => dispatch({ type: 'songToggled', track }),
        onLyricsOpened: track => {
            const lyricsUrl = state.trackLyrics[track.id];
            if (typeof lyricsUrl !== 'string' || lyricsUrl.trim().length === 0) {
                return;
            }

            openExternalUrl(lyricsUrl).catch(error => {
                console.warn('release-page: failed to open lyrics url', { lyricsUrl, error });
            });
        },
    };
}