import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { CachedImageComponent, Container, SelectableText } from '../../../components/StyledComponents';
import { ReleaseGroupReleaseListItem } from '../../../modules/models/models';
import { getStyles } from '../../../styles/styles';

interface ReleaseGroupCardProps {
    releases: ReleaseGroupReleaseListItem[];
    releaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    onPress: (release: ReleaseGroupReleaseListItem) => void;
}

const ReleaseGroupCard = ({
    releases,
    releaseCovers,
    pendingReleaseCoverIds,
    onPress
}: ReleaseGroupCardProps) => {
    const styles = getStyles();
    const pendingReleaseCoverIdSet = new Set(pendingReleaseCoverIds);

    const renderRow = (rowReleases: ReleaseGroupReleaseListItem[]) => (

        <View style={styles.row}>
            {rowReleases.map((release) => (
                <TouchableOpacity
                    key={`release-${release.id}`}
                    onPress={() => onPress(release)}
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

    return (
        <Container>
            <ScrollView showsVerticalScrollIndicator={false}>
                {renderReleases()}
            </ScrollView>
        </Container>
    );
};

export default ReleaseGroupCard;
