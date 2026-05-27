import React from 'react';
import { View } from 'react-native';
import { SelectableText } from '../../../components/StyledComponents';
import ExternalLinksGrid from '../../../components/ExternalLinksGrid';
import { ResponsiveHeaderImage } from '../../../components/ResponsiveHeaderImage';
import type { Release } from '../../../modules/models/models';
import { nameWithDisambiguation } from '../../../modules/utils/helpers';
import { getStyles } from '../../../styles/styles';

interface ReleaseHeaderProps {
    release: Release;
}

const ReleaseHeader = ({ release }: ReleaseHeaderProps) => {
    const styles = getStyles();

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
                <SelectableText style={styles.releaseDate}>
                    Released {release.date_for_display}
                </SelectableText>
                <ExternalLinksGrid links={release.externalLinks} />
            </View>
        </View>
    );
};

export default ReleaseHeader;
