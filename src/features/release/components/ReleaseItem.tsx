import React from 'react';
import { TouchableOpacity, View, LayoutChangeEvent } from 'react-native';
import { CachedImageComponent } from '../../../components/cachedImage/CachedImageComponent';
import { SelectableText } from '../../../components/ui';
import type { NewReleaseListItem } from '../state/NewReleaseFeedContext';
import { nameWithDisambiguation } from '../../../shared/music';
import { getStyles } from '../../../styles/styles';

interface ReleaseItemProps {
    release: NewReleaseListItem;
    isSelected: boolean;
    isCoverLoading?: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onLayout?: (event: LayoutChangeEvent, id: string) => void;
}

const ReleaseItem = ({
    release,
    isSelected,
    isCoverLoading = false,
    onPress,
    onLongPress,
    onLayout
}: ReleaseItemProps) => {
    const styles = React.useMemo(() => getStyles(), []);

    const containerStyle = [
        styles.songCard,
        isSelected && { backgroundColor: '#1a5276' }
    ];
    const releaseType = release['primary-type'] ?? 'Other';
    const artistNames = Object.values(release.artists).filter(Boolean).join(', ');
    const artistText = artistNames
        ? `${releaseType} by ${artistNames}`
        : releaseType;

    return (
        <View style={containerStyle}>
            <TouchableOpacity
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.releaseItem}
                onLayout={(e) => onLayout ? onLayout(e, release.id) : undefined}
            >
                <View style={styles.coverContainerReleases}>
                    <CachedImageComponent
                        imageUrl={release.cover_url}
                        type='release'
                        style={styles.coverArtReleases}
                        showSpinnerWhenNoImage={isCoverLoading}
                    />
                </View>
                <View style={styles.releaseInfo}>
                    <SelectableText
                        style={styles.releaseItemTitle}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        selectable={false}
                    >
                        {nameWithDisambiguation(release.disambiguation, release.title)}
                    </SelectableText>
                    <SelectableText style={styles.releaseDate} numberOfLines={1} selectable={false}>
                        {release.date_for_display}
                    </SelectableText>
                    <SelectableText
                        style={styles.artists}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        selectable={false}
                    >
                        {artistText}
                    </SelectableText>
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default React.memo(ReleaseItem);
