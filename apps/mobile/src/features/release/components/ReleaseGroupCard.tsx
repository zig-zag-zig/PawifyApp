import { MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CachedImageComponent } from '../../../components/cachedImage/CachedImageComponent';
import { ScreenContainer, SelectableText } from '../../../components/ui';
import { ReleaseGroupReleaseListItem } from '@pawify/shared';
import { getStyles } from '../../../styles/styles';

interface ReleaseGroupCardProps {
    releases: ReleaseGroupReleaseListItem[];
    releaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    releaseGroupId: string | null;
    onPress: (release: ReleaseGroupReleaseListItem) => void;
    onContentReady: () => void;
}

const ReleaseGroupCard = ({
    releases,
    releaseCovers,
    pendingReleaseCoverIds,
    releaseGroupId,
    onPress,
    onContentReady,
}: ReleaseGroupCardProps) => {
    const styles = getStyles();
    const pendingReleaseCoverIdSet = new Set(pendingReleaseCoverIds);

    const renderRow = (rowReleases: ReleaseGroupReleaseListItem[]) => (

        <View style={styles.row}>
            {rowReleases.map((release) => (
                <TouchableOpacity
                    key={`release-${release.id}`}
                    onPress={() => onPress(release)}
                    activeOpacity={1}
                    style={styles.albumContainer}
                >
                    <CachedImageComponent
                        imageUrl={releaseCovers[release.id]}
                        type='release'
                        showSpinnerWhenNoImage={pendingReleaseCoverIdSet.has(release.id)}
                        style={styles.albumCover}
                    />
                    <SelectableText
                        style={styles.albumNameGrid}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        selectable={false}
                    >
                        {release.title}
                    </SelectableText>
                </TouchableOpacity>
            ))}
            {rowReleases.length === 1 && <View style={styles.albumContainer} />}
        </View>
    );

    const renderReleases = () => {
        const rows = [];
        for (let i = 0; i < releases.length; i += 2) {
            rows.push(
                <View key={`row-${i / 2}`}>
                    {renderRow(releases.slice(i, i + 2))}
                </View>
            );
        }
        return rows;
    };

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
            {releaseGroupId && (
                <View style={cardStyles.headerRow}>
                    <TouchableOpacity
                        onPress={onShare}
                        accessibilityRole="button"
                        accessibilityLabel="Share this release group"
                        style={cardStyles.shareButton}
                    >
                        <MaterialIcons name="share" size={16} color="#81ddff" />
                        <Text style={cardStyles.shareText}>Share</Text>
                    </TouchableOpacity>
                </View>
            )}
            <ScrollView
                showsVerticalScrollIndicator={false}
                onContentSizeChange={onContentReady}
            >
                {renderReleases()}
            </ScrollView>
        </ScreenContainer>
    );
};

const cardStyles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 8,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.52)',
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    shareText: {
        color: '#81ddff',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default ReleaseGroupCard;
