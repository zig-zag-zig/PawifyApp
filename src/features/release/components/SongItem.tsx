import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import ArtistMinimalCard from '../../../components/ArtistMinimalCard';
import { PulsingPlaceholder } from '../../../components/cachedImage/CachedImagePlaceholders';
import { Track } from '../../../shared/music';
import { CONTAINER_HORIZONTAL_PADDING } from '../../../styles/styles';
import { ArtistNavigationProp } from '../../../types/navigation';
import { useNavigation } from '@react-navigation/native';

interface SongItemProps {
    rowIndex: number;
    selectedSong: Track | null;
    track: Track;
    artistProfileImages: Record<string, string | null | undefined>;
    lyricsUrl: string | null | undefined;
    pendingLyricTrackIds: string[];
    pendingArtistImageIds: string[];
    onPress: (track: Track) => void;
    onLyricsPress: (track: Track) => void;
}

const SongItem = ({
    rowIndex,
    selectedSong,
    track,
    artistProfileImages,
    lyricsUrl,
    pendingLyricTrackIds,
    pendingArtistImageIds,
    onPress,
    onLyricsPress
}: SongItemProps) => {
    const navigation = useNavigation<ArtistNavigationProp>();
    const isExpanded = selectedSong?.id === track.id;
    const isLyricsPending = pendingLyricTrackIds.includes(track.id);
    const hasLyrics = typeof lyricsUrl === 'string' && lyricsUrl.length > 0;
    const isLyricsLoading = lyricsUrl === undefined && isLyricsPending;
    const isLyricsMissing = lyricsUrl === null || (lyricsUrl === undefined && !isLyricsPending);
    const rowBackgroundColor = rowIndex % 2 === 0
        ? '#111827'
        : '#1a2435';
    const lyricsButtonBackgroundColor = isLyricsMissing
        ? 'rgba(148, 163, 184, 0.12)'
        : 'rgba(56, 189, 248, 0.16)';
    const lyricsButtonBorderColor = isLyricsMissing
        ? 'rgba(148, 163, 184, 0.4)'
        : 'rgba(56, 189, 248, 0.52)';
    const lyricsIconColor = isLyricsMissing
        ? '#a8b3bf'
        : '#81ddff';
    const lyricsAccessibilityLabel = isLyricsLoading
        ? `Lyrics loading for ${track.title}`
        : hasLyrics
            ? `Open lyrics for ${track.title}`
            : `Lyrics unavailable for ${track.title}`;

    return (
        <View
            style={{
                backgroundColor: rowBackgroundColor,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.05)',
            }}
        >
            <TouchableOpacity
                onPress={() => onPress(track)}
                activeOpacity={1}
                style={{
                    paddingHorizontal: CONTAINER_HORIZONTAL_PADDING,
                    paddingTop: 14,
                    paddingBottom: isExpanded ? 12 : 14,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                        <Text
                            style={{
                                color: '#f8fafc',
                                fontSize: 18,
                                fontWeight: '700',
                                lineHeight: 24,
                            }}
                            numberOfLines={isExpanded ? undefined : 1}
                            ellipsizeMode="tail"
                        >
                            {track.title}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={(event) => {
                            event.stopPropagation();
                            if (hasLyrics) {
                                onLyricsPress(track);
                            }
                        }}
                        disabled={!hasLyrics || isLyricsLoading}
                        activeOpacity={1}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            borderWidth: isLyricsLoading ? 0 : 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderColor: isLyricsLoading ? 'transparent' : lyricsButtonBorderColor,
                            backgroundColor: isLyricsLoading ? 'transparent' : lyricsButtonBackgroundColor,
                            overflow: 'hidden',
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={lyricsAccessibilityLabel}
                    >
                        {isLyricsLoading ? (
                            <PulsingPlaceholder
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 8,
                                }}
                            />
                        ) : (
                            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons
                                    name="lyrics"
                                    size={22}
                                    color={lyricsIconColor}
                                />
                                {isLyricsMissing && (
                                    <View
                                        pointerEvents="none"
                                        style={{
                                            position: 'absolute',
                                            left: -6,
                                            top: 10,
                                            width: 32,
                                            height: 2,
                                            borderRadius: 1,
                                            backgroundColor: '#a8b3bf',
                                            transform: [{ rotate: '45deg' }],
                                            opacity: 0.9,
                                        }}
                                    />
                                )}
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {isExpanded && (
                    <View style={{ marginTop: 10 }}>
                        {track['artist-credit'].map((artist) => (
                            <ArtistMinimalCard
                                key={artist.id}
                                artist={artist}
                                profileImageUrl={artistProfileImages[artist.id]}
                                showProfileImageSpinnerWhenMissing={
                                    pendingArtistImageIds.includes(artist.id) && artistProfileImages[artist.id] === undefined
                                }
                                onPress={() => navigation.navigate('Artist', { artistId: artist.id })}
                                smallPicture={true}
                                compactTouchTarget={true}
                                showDisambiguation={false}
                            />
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
};

export default SongItem;
