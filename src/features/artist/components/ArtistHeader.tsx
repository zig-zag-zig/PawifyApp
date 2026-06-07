import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SelectableText } from '../../../components/ui';
import ExternalLinksGrid from '../../../components/ExternalLinksGrid';
import { ResponsiveHeaderImage } from '../../../components/ResponsiveHeaderImage';
import type { Artist } from '../../../shared/music';
import { formatDate } from '../../../shared/music';
import { nameWithDisambiguation } from '../../../shared/music';
import { getStyles } from '../../../styles/styles';
import { calculateArtistAge } from '../domain/calculateArtistAge';
import ArtistRelationships from './ArtistRelationships';

interface ArtistHeaderProps {
    artist: Artist | undefined;
    isLoadingArtist: boolean;
    isFollowLoading: boolean;
    isFollowDisabled: boolean;
    isFollowing: boolean;
    onToggleFollow: () => void;
    profilePictures: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    onArtistPressed: (id: string) => void;
    onRelationshipsExpanded: (artistIds: string[]) => void;
}

const ArtistHeader = ({
    artist,
    isLoadingArtist,
    isFollowing,
    isFollowLoading,
    isFollowDisabled,
    onToggleFollow,
    profilePictures,
    pendingArtistImageIds,
    onArtistPressed,
    onRelationshipsExpanded
}: ArtistHeaderProps) => {
    const styles = useMemo(() => getStyles(), []);

    if (!artist) return null;

    const followLabel = isFollowLoading
        ? (isFollowing ? 'Following...' : 'Unfollowing...')
        : (isFollowing ? 'Unfollow' : 'Follow');
    const followIconName = isFollowLoading
        ? 'clock-outline'
        : (isFollowing ? 'check' : 'plus');
    const followButtonColors = {
        backgroundColor: isFollowLoading
            ? 'rgba(148, 163, 184, 0.16)'
            : 'rgba(255, 255, 255, 0.04)',
        borderColor: isFollowLoading
            ? 'rgba(203, 213, 225, 0.34)'
            : isFollowing
                ? 'rgba(134, 239, 172, 0.48)'
                : 'rgba(147, 197, 253, 0.48)',
        textColor: isFollowLoading
            ? '#cbd5e1'
            : isFollowing
                ? '#86efac'
                : '#bfdbfe',
    };
    const isFollowButtonDisabled = isFollowLoading || isFollowDisabled;
    const isGroup = artist?.type === "Group";
    const birthDate = artist?.lifeSpan?.begin;
    const birthPlace = artist?.beginArea?.name;
    const deathDate = artist?.lifeSpan?.end;
    const age = birthDate ? calculateArtistAge(birthDate, deathDate) : null;

    return (
        <View key="artist-header" style={{ backgroundColor: styles.container.backgroundColor }}>
            <ResponsiveHeaderImage
                imageUrl={profilePictures[artist.id]}
                type="profile"
                containerStyle={styles.artistPageBlock}
                borderRadius={8}
                showSpinnerWhenNoImage={pendingArtistImageIds.includes(artist.id)}
            />

            <View style={[styles.artistHeaderTextContainer, { backgroundColor: styles.container.backgroundColor }]}>
                {!isLoadingArtist && (
                    <TouchableOpacity
                        onPress={onToggleFollow}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isFollowButtonDisabled, busy: isFollowLoading }}
                        style={[
                            localStyles.followButton,
                            {
                                backgroundColor: followButtonColors.backgroundColor,
                                borderColor: followButtonColors.borderColor,
                                opacity: isFollowDisabled && !isFollowLoading ? 0.58 : 1,
                            },
                        ]}
                        disabled={isFollowButtonDisabled}
                    >
                        <MaterialCommunityIcons
                            name={followIconName}
                            size={19}
                            color={followButtonColors.textColor}
                        />
                        <Text style={[localStyles.followButtonText, { color: followButtonColors.textColor }]}>
                            {followLabel}
                        </Text>
                    </TouchableOpacity>
                )}

                <SelectableText style={styles.title}>
                    {nameWithDisambiguation(artist.disambiguation, artist.name)}
                </SelectableText>

                {birthDate && (
                    <SelectableText>
                        {isGroup ? "Founded" : "Born"} {formatDate(birthDate)}
                        {!deathDate && age !== null && ` (${age} years)`}
                    </SelectableText>
                )}

                {birthPlace && (
                    <SelectableText>
                        {isGroup ? "Founded in" : "Born in"} {birthPlace}
                    </SelectableText>
                )}

                {deathDate && (
                    <SelectableText>
                        {isGroup ? "Disbanded" : "Died"} {formatDate(deathDate)}
                        {age !== null && ` (${age} years)`}
                    </SelectableText>
                )}

                {(artist?.aliases.length ?? 0) > 0 && (
                    <SelectableText>
                        Also known as {artist?.aliases.map((a) => a.name).join(", ")}
                    </SelectableText>
                )}

                <ExternalLinksGrid links={artist.externalLinks} />

                <ArtistRelationships
                    artist={artist}
                    profilePictures={profilePictures}
                    pendingArtistImageIds={pendingArtistImageIds}
                    onArtistPressed={onArtistPressed}
                    onExpanded={onRelationshipsExpanded}
                />
            </View>
        </View>
    );
};

const localStyles = StyleSheet.create({
    followButton: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 132,
        height: 42,
        paddingHorizontal: 16,
        marginBottom: 12,
        borderRadius: 21,
        borderWidth: 1,
    },
    followButtonText: {
        marginLeft: 7,
        fontSize: 14,
        fontWeight: '700',
    },
});

export default ArtistHeader;
