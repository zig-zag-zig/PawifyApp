import { MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CachedImageComponent } from '../../../components/cachedImage/CachedImageComponent';
import { InlineLink, ScreenContainer, SelectableText } from '../../../components/ui';
import { formatDisplayDate, ReleaseGroupReleaseListItem } from '@pawify/shared';

interface ReleaseGroupCardProps {
    releases: ReleaseGroupReleaseListItem[];
    releaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    releaseGroupId: string | null;
    releaseLoadFailed: boolean;
    onPress: (release: ReleaseGroupReleaseListItem) => void;
    onRetryLoadReleases: () => void;
    onContentReady: () => void;
}

const ReleaseGroupCard = ({
    releases,
    releaseCovers,
    pendingReleaseCoverIds,
    releaseGroupId,
    releaseLoadFailed,
    onPress,
    onRetryLoadReleases,
    onContentReady,
}: ReleaseGroupCardProps) => {
    const pendingReleaseCoverIdSet = new Set(pendingReleaseCoverIds);
    const releaseCountLabel =
        releases.length > 0
            ? `${releases.length} ${releases.length === 1 ? 'release' : 'releases'}`
            : 'Releases';

    const onShare = React.useCallback(() => {
        if (!releaseGroupId) {
            return;
        }

        const link = Linking.createURL(`release-group/${releaseGroupId}`);
        const title = releases[0]?.title;
        void Share.share({
            message: `${title ? `${title} — ` : ''}${link}`,
            url: link,
        }).catch(() => {
            // User dismissed the sheet — nothing to do.
        });
    }, [releaseGroupId, releases]);

    return (
        <ScreenContainer>
            <View style={cardStyles.headerRow}>
                <Text style={cardStyles.headerTitle}>{releaseCountLabel}</Text>
                {releaseGroupId && (
                    <TouchableOpacity
                        onPress={onShare}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                        accessibilityLabel="Share this release group"
                        style={cardStyles.shareButton}
                        hitSlop={8}
                    >
                        <MaterialIcons name="share" size={20} color="#CBD5E1" />
                    </TouchableOpacity>
                )}
            </View>
            <ScrollView
                style={cardStyles.releaseList}
                contentContainerStyle={cardStyles.releaseListContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={onContentReady}
            >
                {releaseLoadFailed ? (
                    <View style={cardStyles.errorState}>
                        <Text style={cardStyles.errorText}>Unable to load this release group.</Text>
                        <InlineLink onPress={onRetryLoadReleases}>Retry</InlineLink>
                    </View>
                ) : (
                    <>
                        {releases.map((release) => (
                            <TouchableOpacity
                                key={`release-${release.id}`}
                                onPress={() => onPress(release)}
                                activeOpacity={0.72}
                                accessibilityRole="button"
                                accessibilityLabel={`Open release ${release.title}`}
                                style={cardStyles.releaseRow}
                            >
                                <CachedImageComponent
                                    imageUrl={releaseCovers[release.id]}
                                    type="release"
                                    showSpinnerWhenNoImage={pendingReleaseCoverIdSet.has(
                                        release.id,
                                    )}
                                    entityType="release"
                                    entityId={release.id}
                                    style={cardStyles.releaseCover}
                                />
                                <View style={cardStyles.releaseTextGroup}>
                                    <SelectableText
                                        style={cardStyles.releaseTitle}
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                        selectable={false}
                                    >
                                        {release.title}
                                    </SelectableText>
                                    <SelectableText
                                        style={cardStyles.releaseDate}
                                        numberOfLines={1}
                                        selectable={false}
                                    >
                                        {formatDisplayDate(release.date)}
                                    </SelectableText>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color="#64748B" />
                            </TouchableOpacity>
                        ))}
                        {releases.length === 0 && (
                            <Text style={cardStyles.emptyText}>No releases available.</Text>
                        )}
                    </>
                )}
            </ScrollView>
        </ScreenContainer>
    );
};

const cardStyles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 14,
        minHeight: 44,
    },
    headerTitle: {
        color: '#94A3B8',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
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
    releaseList: {
        flex: 1,
    },
    releaseListContent: {
        paddingBottom: 24,
    },
    releaseRow: {        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.14)',
        backgroundColor: 'rgba(30, 41, 59, 0.34)',
    },
    releaseCover: {
        width: 64,
        height: 64,
        borderRadius: 8,
    },
    releaseTextGroup: {
        flex: 1,
        gap: 4,
    },
    releaseTitle: {
        color: '#F1F5F9',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 18,
    },
    releaseDate: {
        color: '#94A3B8',
        fontSize: 13,
    },
    emptyText: {
        color: '#94A3B8',
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 24,
    },
    errorState: {
        alignItems: 'center',
        paddingVertical: 32,
        gap: 8,
    },
    errorText: {
        color: '#FCA5A5',
        fontSize: 14,
        textAlign: 'center',
    },
});

export default ReleaseGroupCard;
