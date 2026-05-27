import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Container, Spinner } from '../../../components/StyledComponents';
import { InfoBanner } from '../../../components/InfoBanner';
import type { Track } from '../../../modules/models/models';
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

    return (
        <Container>
            <Spinner
                isLoading={state.checkingExistence && state.releaseExists !== false}
                backdropVariant="strong"
            />

            {state.releaseExists === false && (
                <InfoBanner
                    message="This release no longer exists"
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

        </Container>
    );
};

export default ReleaseView;
