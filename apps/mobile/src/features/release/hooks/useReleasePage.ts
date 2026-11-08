import { RouteProp, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { Release } from '@pawify/shared';
import { openExternalUrl } from '../../../services/externalNavigation';
import { isApiCallError } from '../../../services/apiErrors';
import { extractArtistProfileImages, extractReleaseTrackLyrics } from '../../../utils/taskResultMaps';
import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import type { ReleaseTracksResponse } from '../../../types/apiTypes';
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
    const { getRelease, getReleaseTracks, waitForTaskResultById } = useReleaseApi();
    const [state, dispatch] = useReducer(
        releaseReducer,
        undefined,
        createInitialReleaseState
    );
    const releaseTracksLyricsRef = useRef(releaseTracksLyrics);
    const artistProfileImagesRef = useRef(artistProfileImages);
    const currentReleaseRef = useRef<Release | null>(null);

    useEffect(() => {
        releaseTracksLyricsRef.current = releaseTracksLyrics;
        artistProfileImagesRef.current = artistProfileImages;
    }, [artistProfileImages, releaseTracksLyrics]);

    useEffect(() => {
        currentReleaseRef.current = state.release;
    }, [state.release]);

    const applyTracksResponse = useCallback(
        (
            baseRelease: Release,
            tracksResponse: ReleaseTracksResponse,
            isCancelled: () => boolean,
        ) => {
            const releaseWithTracks: Release = {
                ...cloneRelease(baseRelease),
                media: tracksResponse.media ?? [],
            };
            currentReleaseRef.current = releaseWithTracks;

            const lyricsTaskId = tracksResponse.lyricsTaskId;
            const profileImageTaskId = tracksResponse.profileImageTaskId;
            const immediateTrackLyrics = normalizeNullableStringMap(tracksResponse.trackLyrics);
            const immediateProfileImages = normalizeNullableStringMap(tracksResponse.profileImages);

            setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, immediateTrackLyrics));
            setArtistProfileImages(prev => mergeNullableStringMaps(prev, immediateProfileImages));

            const mergedTrackLyrics = mergeNullableStringMaps(
                collectTrackLyricsForRelease(
                    releaseWithTracks,
                    releaseTracksLyricsRef.current
                ),
                immediateTrackLyrics
            );
            const mergedArtistImages = mergeNullableStringMaps(
                collectArtistImagesForRelease(
                    releaseWithTracks,
                    artistProfileImagesRef.current
                ),
                immediateProfileImages
            );

            const pendingLyricTrackIds = lyricsTaskId
                ? collectTrackIds(releaseWithTracks).filter(trackId => mergedTrackLyrics[trackId] === undefined)
                : [];
            const pendingArtistImageIds = profileImageTaskId
                ? collectArtistIds(releaseWithTracks).filter(artistId => mergedArtistImages[artistId] === undefined)
                : [];

            dispatch({
                type: 'lyricsLoadingStarted',
                release: releaseWithTracks,
                trackLyrics: mergedTrackLyrics,
                artistProfileImages: mergedArtistImages,
                pendingLyricTrackIds,
                pendingArtistImageIds,
            });

            const resolveLyricsTask = async () => {
                let nextTrackLyrics = mergedTrackLyrics;

                await resolveNullableTaskMap({
                    taskId: lyricsTaskId,
                    expectedIds: pendingLyricTrackIds,
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractReleaseTrackLyrics,
                    onResolvedValues: (trackLyrics, resolvedTrackIds) => {
                        if (isCancelled()) {
                            return;
                        }

                        setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, trackLyrics));
                        nextTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, trackLyrics);

                        dispatch({
                            type: 'lyricsLoadingFinished',
                            release: releaseWithTracks,
                            trackLyrics: nextTrackLyrics,
                            resolvedLyricTrackIds: resolvedTrackIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve lyrics task result failed', error);
                    },
                    recreateTask: async () => {
                        const replayed = await getReleaseTracks(releaseId);
                        setReleaseTracksLyrics(prev => mergeNullableStringMaps(
                            prev,
                            normalizeNullableStringMap(replayed.trackLyrics)
                        ));
                        setArtistProfileImages(prev => mergeNullableStringMaps(
                            prev,
                            normalizeNullableStringMap(replayed.profileImages)
                        ));
                        return replayed.lyricsTaskId;
                    },
                    recreateTaskDescription: 'getReleaseTracks.lyricsTaskId',
                });
            };

            const resolveTrackArtistImagesTask = async () => {
                let nextArtistImages = mergedArtistImages;

                await resolveNullableTaskMap({
                    taskId: profileImageTaskId,
                    expectedIds: pendingArtistImageIds,
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (artistImages, resolvedArtistIds) => {
                        if (isCancelled()) {
                            return;
                        }

                        setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistImages));
                        nextArtistImages = mergeNullableStringMaps(nextArtistImages, artistImages);

                        dispatch({
                            type: 'artistImagesLoadingFinished',
                            release: releaseWithTracks,
                            artistProfileImages: nextArtistImages,
                            resolvedArtistImageIds: resolvedArtistIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve artist image task result failed', error);
                    },
                    recreateTask: async () => {
                        const replayed = await getReleaseTracks(releaseId);
                        setArtistProfileImages(prev => mergeNullableStringMaps(
                            prev,
                            normalizeNullableStringMap(replayed.profileImages)
                        ));
                        return replayed.profileImageTaskId;
                    },
                    recreateTaskDescription: 'getReleaseTracks.profileImageTaskId',
                });
            };

            void resolveLyricsTask();
            void resolveTrackArtistImagesTask();
        },
        [
            getReleaseTracks,
            releaseId,
            setArtistProfileImages,
            setReleaseTracksLyrics,
            waitForTaskResultById,
        ],
    );

    useEffect(() => {
        let isCancelled = false;

        const loadRelease = async () => {
            dispatch({ type: 'releaseLoadStarted' });

            if (!releaseId) {
                dispatch({ type: 'releaseLoadFailed', notFound: true });
                return;
            }

            // Start the tracklist request in parallel with the mirror-backed metadata
            // lookup, so the Release header renders immediately without waiting on the
            // MusicBrainz rate limiter.
            const tracksPromise = getReleaseTracks(releaseId);

            let resolvedRelease: Release;
            let headerProfileImageTaskId: string | null;
            let immediateHeaderProfileImages: Record<string, string | null> = {};

            try {
                const releaseResponse = await getRelease(releaseId);
                if (isCancelled) {
                    return;
                }

                resolvedRelease = cloneRelease(releaseResponse.release);
                headerProfileImageTaskId = releaseResponse.profileImageTaskId;
                immediateHeaderProfileImages = normalizeNullableStringMap(
                    releaseResponse.profileImages
                );
            } catch (error) {
                console.error('release-page: fetch release payload failed', error);
                void tracksPromise.catch(() => {});
                if (!isCancelled) {
                    dispatch({
                        type: 'releaseLoadFailed',
                        notFound: isApiCallError(error) && error.statusCode === 404,
                    });
                }
                return;
            }

            setArtistProfileImages(prev =>
                mergeNullableStringMaps(prev, immediateHeaderProfileImages)
            );
            const mergedHeaderArtistImages = mergeNullableStringMaps(
                collectArtistImagesForRelease(
                    resolvedRelease,
                    artistProfileImagesRef.current
                ),
                immediateHeaderProfileImages
            );
            const pendingHeaderArtistImageIds = headerProfileImageTaskId
                ? collectArtistIds(resolvedRelease).filter(
                      artistId => mergedHeaderArtistImages[artistId] === undefined
                  )
                : [];

            currentReleaseRef.current = resolvedRelease;
            dispatch({
                type: 'releaseMetadataLoaded',
                release: resolvedRelease,
                artistProfileImages: mergedHeaderArtistImages,
                pendingArtistImageIds: pendingHeaderArtistImageIds,
            });

            if (headerProfileImageTaskId && pendingHeaderArtistImageIds.length > 0) {
                let nextArtistImages = mergedHeaderArtistImages;
                void resolveNullableTaskMap({
                    taskId: headerProfileImageTaskId,
                    expectedIds: pendingHeaderArtistImageIds,
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (artistImages, resolvedArtistIds) => {
                        if (isCancelled) {
                            return;
                        }
                        setArtistProfileImages(prev =>
                            mergeNullableStringMaps(prev, artistImages)
                        );
                        nextArtistImages = mergeNullableStringMaps(
                            nextArtistImages,
                            artistImages
                        );
                        dispatch({
                            type: 'artistImagesLoadingFinished',
                            release: currentReleaseRef.current ?? resolvedRelease,
                            artistProfileImages: nextArtistImages,
                            resolvedArtistImageIds: resolvedArtistIds,
                        });
                    },
                    onError: error => {
                        console.error(
                            'release-page: resolve header artist image task failed',
                            error
                        );
                    },
                    recreateTask: async () => {
                        const replayed = await getRelease(releaseId);
                        setArtistProfileImages(prev =>
                            mergeNullableStringMaps(
                                prev,
                                normalizeNullableStringMap(replayed.profileImages)
                            )
                        );
                        return replayed.profileImageTaskId;
                    },
                    recreateTaskDescription: 'getRelease.profileImageTaskId',
                });
            }

            try {
                const tracksResponse = await tracksPromise;
                if (isCancelled) {
                    return;
                }
                applyTracksResponse(resolvedRelease, tracksResponse, () => isCancelled);
            } catch (error) {
                console.error('release-page: fetch release tracks failed', error);
                if (!isCancelled) {
                    dispatch({ type: 'tracksLoadFailed' });
                }
            }
        };

        void loadRelease();

        return () => {
            isCancelled = true;
        };
    }, [
        applyTracksResponse,
        getRelease,
        getReleaseTracks,
        releaseId,
        setArtistProfileImages,
        waitForTaskResultById,
    ]);

    const onRetryTracks = useCallback(() => {
        const baseRelease = currentReleaseRef.current;
        if (!releaseId || !baseRelease) {
            return;
        }
        let cancelled = false;
        dispatch({ type: 'tracksLoadStarted' });
        void getReleaseTracks(releaseId)
            .then(tracksResponse => {
                if (!cancelled) {
                    applyTracksResponse(baseRelease, tracksResponse, () => cancelled);
                }
            })
            .catch(error => {
                console.error('release-page: retry release tracks failed', error);
                if (!cancelled) {
                    dispatch({ type: 'tracksLoadFailed' });
                }
            });
    }, [applyTracksResponse, getReleaseTracks, releaseId]);

    const uiState: ReleasePageUiState = {
        release: state.release,
        selectedSong: state.selectedSong,
        trackLyrics: state.trackLyrics,
        artistProfileImages: state.artistProfileImages,
        pendingLyricTrackIds: state.pendingLyricTrackIds,
        pendingArtistImageIds: state.pendingArtistImageIds,
        loadingTracks: state.loadingTracks,
        tracksLoadFailed: state.tracksLoadFailed,
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
        onRetryTracks,
    };
}
