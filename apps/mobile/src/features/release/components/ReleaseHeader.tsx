import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SelectableText } from '../../../components/ui';
import ExternalLinksGrid from '../../../components/ExternalLinksGrid';
import { ResponsiveHeaderImage } from '../../../components/ResponsiveHeaderImage';
import type { ArtistCredit, Release } from '@pawify/shared';
import { nameWithDisambiguation } from '@pawify/shared';
import { getStyles } from '../../../styles/styles';
import { ArtistNavigationProp } from '../../../types/navigation';

interface ReleaseHeaderProps {
    release: Release;
}

function dedupeArtistCredits(artistCredits: ArtistCredit[]): ArtistCredit[] {
    return artistCredits.filter(
        (artist, index, all) => all.findIndex(other => other.id === artist.id) === index
    );
}

const ReleaseHeader = ({ release }: ReleaseHeaderProps) => {
    const styles = getStyles();
    const navigation = useNavigation<ArtistNavigationProp>();
    const artistCredits = React.useMemo(
        () => dedupeArtistCredits(release['artist-credit']),
        [release]
    );

    return (
        <View style={{ backgroundColor: styles.container.backgroundColor }}>
            <ResponsiveHeaderImage
                imageUrl={release.cover_url}
                type="release"
                containerStyle={styles.releaseCoverContainer}
                borderRadius={8}
            />
            <View style={styles.textContainer}>
                <SelectableText style={styles.releaseTitle}>
                    {nameWithDisambiguation(release.disambiguation, release.title)}
                </SelectableText>
                {artistCredits.length > 0 && (
                    <View style={chipStyles.chipsRow}>
                        {artistCredits.map((artist, index) => (
                            <TouchableOpacity
                                key={`${artist.id}-${index}`}
                                onPress={() => navigation.navigate('Artist', { artistId: artist.id })}
                                accessibilityRole="button"
                                accessibilityLabel={`Open artist page for ${artist.name}`}
                                style={chipStyles.chip}
                            >
                                <MaterialIcons
                                    name="person"
                                    size={14}
                                    color="#81ddff"
                                />
                                <SelectableText
                                    style={chipStyles.chipText}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    selectable={false}
                                >
                                    {artist.name}
                                </SelectableText>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                <SelectableText style={styles.releaseDate}>
                    Released {release.date_for_display}
                </SelectableText>
                <ExternalLinksGrid links={release.externalLinks} />
            </View>
        </View>
    );
};

const chipStyles = StyleSheet.create({
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.52)',
        backgroundColor: 'rgba(56, 189, 248, 0.16)',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipText: {
        color: '#81ddff',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 18,
    },
});

export default ReleaseHeader;
