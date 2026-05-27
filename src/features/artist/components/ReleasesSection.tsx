import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, type ListRenderItem } from 'react-native';
import { CachedImageComponent, LoadingText, SelectableText, TouchableText } from '../../../components/StyledComponents';
import type { ArtistReleaseGroup } from '../../../modules/models/models';
import { nameWithDisambiguation } from '../../../modules/utils/helpers';
import { getStyles } from '../../../styles/styles';
import { DEFAULT_RELEASE_ITEMS_TO_SHOW } from '../domain/releaseSections';
import type { ReleaseGroupSection } from '../model/types';

type ReleaseSectionListItem =
    | { type: 'loading'; key: string }
    | { type: 'sectionHeader'; key: string; title: string; sectionIndex: number }
    | { type: 'releaseRow'; key: string; releaseGroups: ArtistReleaseGroup[] }
    | { type: 'loadMore'; key: string; title: string };

interface ReleasesSectionProps {
    ListHeaderComponent?: React.ReactElement | null;
    releaseSections: ReleaseGroupSection[];
    releaseGroupCovers: Record<string, string | null | undefined>;
    pendingReleaseGroupCoverIds: string[];
    loadedItemsByType: Record<string, number>;
    isLoadingReleases: boolean;
    isLoadingReleaseGroup: boolean;
    onReleaseGroupPressed: (releaseGroup: ArtistReleaseGroup) => Promise<void>;
    onLoadMore: (sectionTitle: string) => void;
}

const ReleasesSection = ({
    ListHeaderComponent,
    releaseSections,
    releaseGroupCovers,
    pendingReleaseGroupCoverIds,
    loadedItemsByType,
    isLoadingReleases,
    isLoadingReleaseGroup,
    onReleaseGroupPressed,
    onLoadMore,
}: ReleasesSectionProps) => {
    const styles = useMemo(() => getStyles(), []);
    const pendingReleaseGroupCoverIdSet = useMemo(
        () => new Set(pendingReleaseGroupCoverIds),
        [pendingReleaseGroupCoverIds]
    );
    const listData = useMemo<ReleaseSectionListItem[]>(() => {
        const items: ReleaseSectionListItem[] = [];

        if (isLoadingReleases) {
            items.push({ type: 'loading', key: 'loading-release-groups' });
        }

        releaseSections.forEach((section, sectionIndex) => {
            const itemsToShow = loadedItemsByType[section.title] || DEFAULT_RELEASE_ITEMS_TO_SHOW;
            const sectionData = section.releaseGroups.slice(0, itemsToShow);

            items.push({
                type: 'sectionHeader',
                key: `section-${section.title}`,
                title: section.title,
                sectionIndex,
            });

            for (let i = 0; i < sectionData.length; i += 2) {
                items.push({
                    type: 'releaseRow',
                    key: `${section.title}-row-${i / 2}`,
                    releaseGroups: sectionData.slice(i, i + 2),
                });
            }

            if (section.releaseGroups.length > itemsToShow) {
                items.push({
                    type: 'loadMore',
                    key: `${section.title}-load-more`,
                    title: section.title,
                });
            }
        });

        return items;
    }, [isLoadingReleases, loadedItemsByType, releaseSections]);
    const listExtraData = useMemo(() => ({
        isLoadingReleaseGroup,
        pendingReleaseGroupCoverIds,
        releaseGroupCovers,
    }), [isLoadingReleaseGroup, pendingReleaseGroupCoverIds, releaseGroupCovers]);

    const renderRow = (releaseGroups: ArtistReleaseGroup[]) => (
        <View style={styles.row}>
            {releaseGroups.map((releaseGroup) => (
                <TouchableOpacity
                    key={`release-group-${releaseGroup.id}`}
                    onPress={() => void onReleaseGroupPressed(releaseGroup)}
                    style={styles.albumContainer}
                    disabled={isLoadingReleaseGroup}
                >
                    <CachedImageComponent
                        imageUrl={releaseGroupCovers[releaseGroup.id]}
                        type='release'
                        showSpinnerWhenNoImage={pendingReleaseGroupCoverIdSet.has(releaseGroup.id)}
                        style={styles.albumCover}
                    />
                    <SelectableText
                        style={styles.albumNameGrid}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        selectable={false}
                    >
                        {nameWithDisambiguation(releaseGroup.disambiguation, releaseGroup.title)}
                    </SelectableText>
                </TouchableOpacity>
            ))}
            {releaseGroups.length === 1 && <View style={styles.albumContainer} />}
        </View>
    );

    const renderItem: ListRenderItem<ReleaseSectionListItem> = ({ item }) => {
        if (item.type === 'loading') {
            return (
                <View
                    style={{
                        marginTop: 16,
                        marginHorizontal: 0,
                        marginBottom: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#343b43',
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#252a2f',
                    }}
                >
                    <LoadingText
                        label="Loading release groups"
                        style={{ fontSize: 14, fontWeight: '500' }}
                    />
                </View>
            );
        }

        if (item.type === 'sectionHeader') {
            return (
                <View
                    style={[
                        localStyles.sectionHeader,
                        item.sectionIndex === 0 ? styles.firstSection : localStyles.nextSectionHeader,
                    ]}
                >
                    <Text style={styles.sectionHeaderText}>{item.title}</Text>
                </View>
            );
        }

        if (item.type === 'releaseRow') {
            return renderRow(item.releaseGroups);
        }

        return (
            <TouchableText onPress={() => onLoadMore(item.title)}>
                Load More
            </TouchableText>
        );
    };

    return (
        <FlatList
            data={listData}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            ListHeaderComponent={ListHeaderComponent}
            style={localStyles.list}
            contentContainerStyle={localStyles.contentContainer}
            showsVerticalScrollIndicator={false}
            extraData={listExtraData}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={40}
            windowSize={7}
        />
    );
};

const localStyles = StyleSheet.create({
    list: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 24,
    },
    sectionHeader: {
        marginBottom: 10,
    },
    nextSectionHeader: {
        marginTop: 10,
    },
});

export default ReleasesSection;
