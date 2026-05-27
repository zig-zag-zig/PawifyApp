import { RouteProp, useRoute } from '@react-navigation/native';
import { useEffect, useReducer, useRef } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { Release } from '../../../modules/models/models';
import { openExternalUrl } from '../../../services/externalNavigation';
import {
    extractArtistProfileImages,
    extractReleaseTrackLyrics
} from '../../../utils/taskResultMaps';
import { fillMissingIdsWithNull, mergeNullableStringMaps } from '../../../utils/nullableMaps';
import { RootStackParamList } from '../../../types/navigation';
import { useReleaseApi } from '../api/releaseApi';
import {
    cloneRelease,
    collectArtistImagesForRelease,
    collectTrackLyricsForRelease
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

export function useReleasePage(): ReleasePageController {
    const route = useRoute<ReleaseRouteProp>();
    const releaseId = route.params.releaseId;
    const {
        releaseTracksLyrics,
        setReleaseTracksLyrics,
        artistProfileImages,
        setArtistProfileImages
    } = useCache();
    const { getRelease, waitForTaskResult } = useReleaseApi();
    const [state, dispatch] = useReducer(
        releaseReducer,
        undefined,
        createInitialReleaseState
    );
    const releaseTracksLyricsRef = useRef(releaseTracksLyrics);
    const artistProfileImagesRef = useRef(artistProfileImages);

    useEffect(() => {
        releaseTracksLyricsRef.current = releaseTracksLyrics;
        artistProfileImagesRef.current = artistProfileImages;
    }, [artistProfileImages, releaseTracksLyrics]);

    useEffect(() => {
        let isCancelled = false;

        const loadRelease = async () => {
            dispatch({ type: 'releaseLoadStarted' });

            if (!releaseId) {
                dispatch({ type: 'releaseLoadFailed' });
                return;
            }

            let resolvedRelease: Release;
            let lyricsTaskId: string | null;
            let profileImageTaskId: string | null;

            try {
                const releaseResponse = await getRelease(releaseId);
                if (isCancelled) {
                    return;
                }

                resolvedRelease = cloneRelease(releaseResponse.release);
                lyricsTaskId = releaseResponse.lyricsTaskId;
                profileImageTaskId = releaseResponse.profileImageTaskId;
            } catch (error) {
                console.error('release-page: fetch release payload failed', error);
                if (!isCancelled) {
                    dispatch({ type: 'releaseLoadFailed' });
                }
                return;
            }

            let mergedTrackLyrics = collectTrackLyricsForRelease(
                resolvedRelease,
                releaseTracksLyricsRef.current
            );
            let mergedArtistImages = collectArtistImagesForRelease(
                resolvedRelease,
                artistProfileImagesRef.current
            );

            const pendingLyricTrackIds = lyricsTaskId
                ? collectTrackIds(resolvedRelease).filter(trackId => mergedTrackLyrics[trackId] === undefined)
                : [];
            const pendingArtistImageIds = profileImageTaskId
                ? collectArtistIds(resolvedRelease).filter(artistId => mergedArtistImages[artistId] === undefined)
                : [];

            dispatch({
                type: 'lyricsLoadingStarted',
                release: resolvedRelease,
                trackLyrics: mergedTrackLyrics,
                artistProfileImages: mergedArtistImages,
                pendingLyricTrackIds,
                pendingArtistImageIds,
            });

            const resolveLyricsTask = async () => {
                let nextTrackLyrics = mergedTrackLyrics;

                const applyPartialTrackLyrics = (result: unknown) => {
                    if (isCancelled) {
                        return;
                    }

                    const taskLyrics = extractReleaseTrackLyrics(result);
                    const resolvedTrackIds = pendingLyricTrackIds.filter(trackId => taskLyrics[trackId] !== undefined);
                    if (resolvedTrackIds.length === 0) {
                        return;
                    }

                    setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, taskLyrics));
                    nextTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, taskLyrics);

                    dispatch({
                        type: 'lyricsLoadingFinished',
                        release: resolvedRelease,
                        trackLyrics: nextTrackLyrics,
                        resolvedLyricTrackIds: resolvedTrackIds,
                    });
                };

                try {
                    const lyricsResult = lyricsTaskId
                        ? await waitForTaskResult(lyricsTaskId, {
                            onPartialResult: partialResult => {
                                applyPartialTrackLyrics(partialResult.result);
                            },
                            recreateTask: async () => {
                                const replayedRelease = await getRelease(releaseId);
                                return replayedRelease.lyricsTaskId;
                            },
                            recreateTaskDescription: 'getRelease.lyricsTaskId',
                        })
                        : null;

                    if (isCancelled) {
                        return;
                    }

                    const taskLyrics = lyricsResult?.status.toLowerCase() === 'completed'
                        ? extractReleaseTrackLyrics(lyricsResult.result)
                        : {};
                    const completedTrackLyrics = fillMissingIdsWithNull(pendingLyricTrackIds, taskLyrics);

                    setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, completedTrackLyrics));

                    nextTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, completedTrackLyrics);

                    dispatch({
                        type: 'lyricsLoadingFinished',
                        release: resolvedRelease,
                        trackLyrics: nextTrackLyrics,
                        resolvedLyricTrackIds: pendingLyricTrackIds,
                    });
                } catch (error) {
                    console.error('release-page: resolve lyrics task result failed', error);

                    if (!isCancelled) {
                        const completedTrackLyrics = fillMissingIdsWithNull(pendingLyricTrackIds, {});
                        const fallbackTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, completedTrackLyrics);

                        setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, completedTrackLyrics));

                        dispatch({
                            type: 'lyricsLoadingFinished',
                            release: resolvedRelease,
                            trackLyrics: fallbackTrackLyrics,
                            resolvedLyricTrackIds: pendingLyricTrackIds,
                        });
                    }
                }

                if (isCancelled) {
                    return;
                }
            };

            const resolveArtistImageTask = async () => {
                let nextArtistImages = mergedArtistImages;

                const applyPartialArtistImages = (result: unknown) => {
                    if (isCancelled) {
                        return;
                    }

                    const taskArtistImages = extractArtistProfileImages(result);
                    const resolvedArtistIds = pendingArtistImageIds.filter(artistId => taskArtistImages[artistId] !== undefined);
                    if (resolvedArtistIds.length === 0) {
                        return;
                    }

                    setArtistProfileImages(prev => mergeNullableStringMaps(prev, taskArtistImages));
                    nextArtistImages = mergeNullableStringMaps(nextArtistImages, taskArtistImages);

                    dispatch({
                        type: 'artistImagesLoadingFinished',
                        release: resolvedRelease,
                        artistProfileImages: nextArtistImages,
                        resolvedArtistImageIds: resolvedArtistIds,
                    });
                };

                try {
                    const profileImageResult = profileImageTaskId
                        ? await waitForTaskResult(profileImageTaskId, {
                            onPartialResult: partialResult => {
                                applyPartialArtistImages(partialResult.result);
                            },
                            recreateTask: async () => {
                                const replayedRelease = await getRelease(releaseId);
                                return replayedRelease.profileImageTaskId;
                            },
                            recreateTaskDescription: 'getRelease.profileImageTaskId',
                        })
                        : null;

                    if (isCancelled) {
                        return;
                    }

                    const taskArtistImages = profileImageResult?.status.toLowerCase() === 'completed'
                        ? extractArtistProfileImages(profileImageResult.result)
                        : {};
                    const completedArtistImages = fillMissingIdsWithNull(pendingArtistImageIds, taskArtistImages);

                    setArtistProfileImages(prev => mergeNullableStringMaps(prev, completedArtistImages));

                    nextArtistImages = mergeNullableStringMaps(nextArtistImages, completedArtistImages);

                    dispatch({
                        type: 'artistImagesLoadingFinished',
                        release: resolvedRelease,
                        artistProfileImages: nextArtistImages,
                        resolvedArtistImageIds: pendingArtistImageIds,
                    });
                } catch (error) {
                    console.error('release-page: resolve artist image task result failed', error);

                    if (!isCancelled) {
                        const completedArtistImages = fillMissingIdsWithNull(pendingArtistImageIds, {});
                        const fallbackArtistImages = mergeNullableStringMaps(nextArtistImages, completedArtistImages);

                        setArtistProfileImages(prev => mergeNullableStringMaps(prev, completedArtistImages));

                        dispatch({
                            type: 'artistImagesLoadingFinished',
                            release: resolvedRelease,
                            artistProfileImages: fallbackArtistImages,
                            resolvedArtistImageIds: pendingArtistImageIds,
                        });
                    }
                }

                if (isCancelled) {
                    return;
                }
            };

            void resolveLyricsTask();
            void resolveArtistImageTask();
        };

        void loadRelease();

        return () => {
            isCancelled = true;
        };
    }, [
        getRelease,
        releaseId,
        setArtistProfileImages,
        setReleaseTracksLyrics,
        waitForTaskResult,
    ]);

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
