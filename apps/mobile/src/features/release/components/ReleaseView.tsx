import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
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
    onRetryTracks?: () => void;
}

const ReleaseView = ({
    state,
    onSongPressed,
    onLyricsOpened,
    onRetryTracks,
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
                        {tracks.length > 0 &&
                            tracks.map((track, index) => (
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

                        {tracks.length === 0 && state.loadingTracks && (
                            <View
                                style={trackStatusStyles.container}
                                accessibilityLabel="Loading tracks"
                                accessibilityState={{ busy: true }}
                            >
                                <View style={trackStatusStyles.bannerRow}>
                                    <ActivityIndicator size="small" color="#81ddff" />
                                    <View style={trackStatusStyles.bannerTextGroup}>
                                        <Text style={trackStatusStyles.title}>
                                            Tracks are still loading…
                                        </Text>
                                        <Text style={trackStatusStyles.subtitle}>
                                            Fetching tracklist from MusicBrainz
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {tracks.length === 0 && !state.loadingTracks && state.tracksLoadFailed && (
                            <View style={trackStatusStyles.container}>
                                <View style={trackStatusStyles.bannerRow}>
                                    <MaterialIcons name="error-outline" size={20} color="#fca5a5" />
                                    <View style={trackStatusStyles.bannerTextGroup}>
                                        <Text style={trackStatusStyles.title}>
                                            Could not load tracks right now
                                        </Text>
                                        <Text style={trackStatusStyles.subtitle}>
                                            MusicBrainz may be rate-limited. You can still use the links above or try again.
                                        </Text>
                                    </View>
                                </View>
                                {onRetryTracks && (
                                    <TouchableOpacity
                                        onPress={onRetryTracks}
                                        accessibilityRole="button"
                                        accessibilityLabel="Retry loading tracks"
                                        style={trackStatusStyles.retryButton}
                                    >
                                        <MaterialIcons name="refresh" size={16} color="#81ddff" />
                                        <Text style={trackStatusStyles.retryText}>Try again</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}
        </ScreenContainer>
    );
};

const trackStatusStyles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
    },
    bannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.28)',
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
    },
    bannerTextGroup: {
        flex: 1,
        gap: 2,
    },
    title: {
        color: '#f1f5f9',
        fontSize: 15,
        fontWeight: '600',
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: 13,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.52)',
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    retryText: {
        color: '#81ddff',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default ReleaseView;
