import { RouteProp, useRoute } from '@react-navigation/native';
import { useEffect, useReducer, useRef } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { Release } from '../../../shared/music';
import { openExternalUrl } from '../../../services/externalNavigation';
import {
    extractArtistProfileImages,
    extractReleaseTrackLyrics
} from '../../../utils/taskResultMaps';
import { mergeNullableStringMaps } from '../../../utils/nullableMaps';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
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

                await resolveNullableTaskMap({
                    taskId: lyricsTaskId,
                    expectedIds: pendingLyricTrackIds,
                    waitForTaskResult,
                    extractMap: extractReleaseTrackLyrics,
                    onResolvedValues: (trackLyrics, resolvedTrackIds) => {
                        if (isCancelled) {
                            return;
                        }

                        setReleaseTracksLyrics(prev => mergeNullableStringMaps(prev, trackLyrics));
                        nextTrackLyrics = mergeNullableStringMaps(nextTrackLyrics, trackLyrics);

                        dispatch({
                            type: 'lyricsLoadingFinished',
                            release: resolvedRelease,
                            trackLyrics: nextTrackLyrics,
                            resolvedLyricTrackIds: resolvedTrackIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve lyrics task result failed', error);
                    },
                    recreateTask: async () => {
                        const replayedRelease = await getRelease(releaseId);
                        return replayedRelease.lyricsTaskId;
                    },
                    recreateTaskDescription: 'getRelease.lyricsTaskId',
                });

            };

            const resolveArtistImageTask = async () => {
                let nextArtistImages = mergedArtistImages;

                await resolveNullableTaskMap({
                    taskId: profileImageTaskId,
                    expectedIds: pendingArtistImageIds,
                    waitForTaskResult,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (artistImages, resolvedArtistIds) => {
                        if (isCancelled) {
                            return;
                        }

                        setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistImages));
                        nextArtistImages = mergeNullableStringMaps(nextArtistImages, artistImages);

                        dispatch({
                            type: 'artistImagesLoadingFinished',
                            release: resolvedRelease,
                            artistProfileImages: nextArtistImages,
                            resolvedArtistImageIds: resolvedArtistIds,
                        });
                    },
                    onError: error => {
                        console.error('release-page: resolve artist image task result failed', error);
                    },
                    recreateTask: async () => {
                        const replayedRelease = await getRelease(releaseId);
                        return replayedRelease.profileImageTaskId;
                    },
                    recreateTaskDescription: 'getRelease.profileImageTaskId',
                });

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
