import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { ScreenContainer } from '../../../components/ui';
import { InfoBanner } from '../../../components/InfoBanner';
import { useGlobalSpinner } from '../../../contexts/GlobalSpinnerContext';
import { useContentReady } from '../../../hooks/useContentReady';
import type { Track } from '@pawify/shared';
import { getStyles } from '../../../styles/styles';
import type { ReleasePageUiState } from '../model/types';
import { flattenReleaseTracks } from '../domain/releaseEnrichment';
import ReleaseHeader from './ReleaseHeader';
import SongItem from './SongItem';

interface ReleaseViewProps {
    state: ReleasePageUiState;
    onSongPressed: (track: Track) => void;
    onLyricsOpened: (track: Track) => void;
}

const ReleaseView = ({
    state,
    onSongPressed,
    onLyricsOpened,
}: ReleaseViewProps) => {
    const styles = getStyles();
    const { width: screenWidth } = useWindowDimensions();
    const tracks = state.release ? flattenReleaseTracks(state.release) : [];
    const isLoadingRelease = state.checkingExistence && state.releaseExists !== false && !state.loadFailed;
    const { isWaitingForContent, onContentReady } = useContentReady(
        isLoadingRelease,
        !!state.release && !isLoadingRelease
    );
    useGlobalSpinner(isLoadingRelease || isWaitingForContent);

    return (
        <ScreenContainer>
            {state.releaseExists === false && (
                <InfoBanner
                    message="This release no longer exists."
                    type="error"
                    position="top"
                    visible={true}
                />
            )}

            {state.loadFailed && (
                <InfoBanner
                    message="Could not load this release. Check your connection and try again."
                    type="error"
                    position="top"
                    visible={true}
                />
            )}

            {state.releaseExists !== false && state.release && (
                <ScrollView
                    style={styles.releaseScrollView}
                    showsVerticalScrollIndicator={false}
                    scrollIndicatorInsets={{ right: 1 }}
                    onContentSizeChange={onContentReady}
                >
                    <ReleaseHeader release={state.release} />
                    <View style={[styles.releaseTracksBleedContainer, { width: screenWidth }]}>
                        {tracks.map((track, index) => (
                            <View key={track.id}>
                                <SongItem
                                    rowIndex={index}
                                    selectedSong={state.selectedSong}
                                    track={track}
                                    artistProfileImages={state.artistProfileImages}
                                    lyricsUrl={state.trackLyrics[track.id]}
                                    pendingLyricTrackIds={state.pendingLyricTrackIds}
                                    pendingArtistImageIds={state.pendingArtistImageIds}
                                    onPress={onSongPressed}
                                    onLyricsPress={onLyricsOpened}
                                />
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}

        </ScreenContainer>
    );
};

export default ReleaseView;
