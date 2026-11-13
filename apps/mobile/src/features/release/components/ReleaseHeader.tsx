import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import React from 'react';
import { Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SelectableText } from '../../../components/ui';
import ExternalLinksGrid from '../../../components/ExternalLinksGrid';
import {
    loadPreferredStreamingService,
    savePreferredStreamingService,
} from '../../../services/preferredStreamingService';
import { ResponsiveHeaderImage } from '../../../components/ResponsiveHeaderImage';
import {
    formatDisplayDate,
    nameWithDisambiguation,
    type ArtistCredit,
    type ExternalLinkService,
    type Release,
} from '@pawify/shared';
import { getStyles } from '../../../styles/styles';
import { theme } from '../../../styles/theme';
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
    const [preferredService, setPreferredService] = React.useState<ExternalLinkService | null>(null);

    React.useEffect(() => {
        let isCancelled = false;
        void loadPreferredStreamingService().then(service => {
            if (!isCancelled) {
                setPreferredService(service);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, []);

    const onPreferredServiceChange = React.useCallback((service: ExternalLinkService) => {
        setPreferredService(service);
        void savePreferredStreamingService(service);
    }, []);

    const onShare = React.useCallback(() => {
        const releaseTitle = nameWithDisambiguation(release.disambiguation, release.title);
        const artistNames = dedupeArtistCredits(release['artist-credit'])
            .map((artist) => artist.name)
            .join(', ');
        const link = Linking.createURL(`release/${release.id}`);

        void Share.share({
            message: `${releaseTitle}${artistNames ? ` by ${artistNames}` : ''} — ${link}`,
            url: link,
        }).catch(() => {
            // User dismissed the sheet — nothing to do.
        });
    }, [release]);

    const releaseTitle = nameWithDisambiguation(release.disambiguation, release.title);
    const displayDate = formatDisplayDate(release.date, release.date_for_display);
    const releaseType = release['release-group']?.['primary-type'];
    const trackCount = React.useMemo(
        () =>
            (release.media ?? []).reduce(
                (total, medium) => total + (medium.tracks?.length ?? 0),
                0,
            ),
        [release.media],
    );

    return (
        <View style={{ backgroundColor: styles.container.backgroundColor }}>
            <ResponsiveHeaderImage
                imageUrl={release.cover_url}
                type="release"
                containerStyle={styles.releaseCoverContainer}
                borderRadius={8}
                entityType="release"
                entityId={release.id}
            />
            <View style={styles.textContainer}>
                <View style={headerStyles.titleRow}>
                    <SelectableText style={[styles.releaseTitle, headerStyles.titleText]}>
                        {releaseTitle}
                    </SelectableText>
                    <TouchableOpacity
                        onPress={onShare}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                        accessibilityLabel={`Share ${releaseTitle}`}
                        style={headerStyles.shareButton}
                        hitSlop={8}
                    >
                        <MaterialIcons name="share" size={20} color="#CBD5E1" />
                    </TouchableOpacity>
                </View>

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

                <View style={tagStyles.tagsRow}>
                    {releaseType ? (
                        <View style={[tagStyles.tagPill, tagStyles.tagPillCyan]}>
                            <SelectableText style={[tagStyles.tagText, tagStyles.tagTextCyan]} selectable={false}>
                                {releaseType}
                            </SelectableText>
                        </View>
                    ) : null}
                    <View style={[tagStyles.tagPill, tagStyles.tagPillAmber]}>
                        <SelectableText style={[tagStyles.tagText, tagStyles.tagTextAmber]} selectable={false}>
                            {displayDate}
                        </SelectableText>
                    </View>
                    {trackCount > 0 ? (
                        <View style={[tagStyles.tagPill, tagStyles.tagPillViolet]}>
                            <SelectableText style={[tagStyles.tagText, tagStyles.tagTextViolet]} selectable={false}>
                                {trackCount === 1 ? '1 track' : `${trackCount} tracks`}
                            </SelectableText>
                        </View>
                    ) : null}
                </View>

                <ExternalLinksGrid
                    links={release.externalLinks}
                    preferredService={preferredService}
                    onPreferredServiceChange={onPreferredServiceChange}
                />
            </View>
        </View>
    );
};

const headerStyles = StyleSheet.create({
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 18,
    },
    titleText: {
        flex: 1,
        paddingVertical: 0,
    },
    shareButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(154, 160, 170, 0.35)',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
});

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

const tagStyles = StyleSheet.create({
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    tagPill: {
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.tagPillBorder,
        backgroundColor: theme.colors.tagPillBackground,
        paddingHorizontal: 9,
        paddingVertical: 4,
    },
    tagPillCyan: {
        borderColor: 'rgba(92, 225, 230, 0.58)',
        backgroundColor: 'rgba(92, 225, 230, 0.14)',
    },
    tagPillViolet: {
        borderColor: 'rgba(180, 160, 255, 0.58)',
        backgroundColor: 'rgba(180, 160, 255, 0.14)',
    },
    tagPillAmber: {
        borderColor: 'rgba(232, 184, 109, 0.58)',
        backgroundColor: 'rgba(232, 184, 109, 0.14)',
    },
    tagText: {
        color: theme.colors.tagPillText,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
        lineHeight: 15,
    },
    tagTextCyan: {
        color: '#5CE1E6',
    },
    tagTextViolet: {
        color: '#B4A0FF',
    },
    tagTextAmber: {
        color: '#E8B86D',
    },
});

export default ReleaseHeader;
