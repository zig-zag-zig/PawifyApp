import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CachedImageComponent } from '../../../components/cachedImage/CachedImageComponent';
import { SelectableText } from '../../../components/ui';
import type { Artist } from '../../../shared/music';
import { formatDate } from '../../../shared/music';
import { getStyles } from '../../../styles/styles';
import {
    buildArtistRelationshipGroups,
    getArtistRelationshipBuckets,
    hasArtistRelationships,
} from '../domain/artistRelationships';
import type { MemberRelationship } from '../model/types';

interface ArtistRelationshipsProps {
    artist: Artist;
    profilePictures: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    onArtistPressed: (id: string) => void;
    onExpanded: (artistIds: string[]) => void;
}

interface RelationshipItemProps {
    member: MemberRelationship;
    image: string | null | undefined;
    isPending: boolean;
    styles: ReturnType<typeof getStyles>;
    onArtistPressed: (id: string) => void;
}

const RelationshipItem = React.memo(({
    member,
    image,
    isPending,
    styles,
    onArtistPressed,
}: RelationshipItemProps) => (
    <TouchableOpacity
        onPress={() => onArtistPressed(member.id)}
        style={styles.relationshipItem}
    >
        <CachedImageComponent
            type='profile'
            imageUrl={image}
            showSpinnerWhenNoImage={isPending || image === undefined}
            style={styles.roundPictureSmall}
        />
        <View style={styles.relationshipInfo}>
            <SelectableText
                style={styles.roundPictureSmallText}
                numberOfLines={2}
                ellipsizeMode="tail"
                selectable={false}
            >
                {member.name}
                {member.begin && (
                    <Text style={styles.relationshipDates}>
                        {` (${formatDate(member.begin)} - ${member.end ? formatDate(member.end) : 'Present'})`}
                    </Text>
                )}
            </SelectableText>
        </View>
    </TouchableOpacity>
));

const ArtistRelationships = ({
    artist,
    profilePictures,
    pendingArtistImageIds,
    onArtistPressed,
    onExpanded
}: ArtistRelationshipsProps) => {
    const [showGroupAffiliations, setShowGroupAffiliations] = useState(false);
    const styles = useMemo(() => getStyles(), []);
    const pendingArtistImageIdSet = useMemo(
        () => new Set(pendingArtistImageIds),
        [pendingArtistImageIds]
    );
    const artistRelations = useMemo(() => getArtistRelationshipBuckets(artist), [artist]);
    const hasRelationships = useMemo(
        () => hasArtistRelationships(artistRelations),
        [artistRelations]
    );
    const allRelationships = useMemo(
        () => buildArtistRelationshipGroups(artistRelations),
        [artistRelations]
    );
    const relationshipArtistIds = useMemo(
        () => [...new Set(allRelationships.flatMap(group => group.data.map(member => member.id)))],
        [allRelationships]
    );

    useEffect(() => {
        setShowGroupAffiliations(false);
    }, [artist.id]);

    const handleToggleGroupAffiliations = useCallback(() => {
        const shouldExpand = !showGroupAffiliations;
        setShowGroupAffiliations(shouldExpand);
        if (shouldExpand) {
            onExpanded(relationshipArtistIds);
        }
    }, [onExpanded, relationshipArtistIds, showGroupAffiliations]);

    const renderRelationshipItem = useCallback((member: MemberRelationship) => {
        return (
            <RelationshipItem
                key={member.id}
                member={member}
                image={profilePictures[member.id]}
                isPending={pendingArtistImageIdSet.has(member.id)}
                styles={styles}
                onArtistPressed={onArtistPressed}
            />
        );
    }, [onArtistPressed, pendingArtistImageIdSet, profilePictures, styles]);

    if (!hasRelationships) return null;

    return (
        <View style={styles.groupAffiliationsContainer}>
            <TouchableOpacity
                onPress={handleToggleGroupAffiliations}
                style={styles.groupAffiliationsHeader}
            >
                <Text style={styles.groupAffiliationsTitle}>
                    Group Affiliations
                </Text>
                <MaterialCommunityIcons
                    name={showGroupAffiliations ? "chevron-up" : "chevron-down"}
                    size={24}
                    color={styles.text.color}
                />
            </TouchableOpacity>

            {showGroupAffiliations && (
                <View style={styles.groupAffiliationsContent}>
                    {allRelationships.map((group) => (
                        <View key={group.title} style={styles.relationshipGroup}>
                            <Text style={styles.relationshipGroupTitle}>
                                {group.title} ({group.data.length})
                            </Text>
                            <View style={styles.relationshipList}>
                                {group.data.map(renderRelationshipItem)}
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
};

export default ArtistRelationships;
