import type { Artist, Member } from '@pawify/shared';
import type {
    ArtistRelationshipBuckets,
    ArtistRelationshipGroup,
    MemberRelationship
} from '../model/types';

function mapMember(member: Member): MemberRelationship {
    return {
        id: member.id,
        name: member.name,
        begin: member.begin,
        end: member.end,
    };
}

/** Human-readable labels for the relation types the server surfaces. */
const RELATED_ARTIST_LABELS: Record<string, string> = {
    'collaboration': 'Collaboration',
    'remixer': 'Remixer',
    'producer': 'Producer',
    'instrumental supporting musician': 'Supporting musician',
    'vocal supporting musician': 'Supporting musician',
    'supporting musician': 'Supporting musician',
    'conductor': 'Conductor',
    'DJ-mix': 'DJ mix',
    'samples from artist': 'Sampled artist',
    'tribute': 'Tribute',
    'is person': 'Real name',
    'parent': 'Parent',
    'sibling': 'Sibling',
    'married': 'Married to',
    'named after': 'Named after',
    'teacher': 'Teacher',
    'student': 'Student',
    'involved with': 'Involved with',
};

function mapRelatedArtist(relation: NonNullable<Artist['relatedArtists']>[number]): MemberRelationship {
    return {
        id: relation.id,
        name: relation.name,
        begin: null,
        end: null,
        note: RELATED_ARTIST_LABELS[relation.type] ?? null,
    };
}

export function getArtistRelationshipBuckets(artist: Artist): ArtistRelationshipBuckets {
    const memberIds = new Set<string>();
    const groupIds = new Set<string>();
    const subgroupParentIds = new Set<string>();
    const subgroupChildIds = new Set<string>();

    const buckets: ArtistRelationshipBuckets = {
        groupMembers: [],
        memberOfGroups: [],
        subgroupOf: [],
        subgroups: [],
        related: []
    };

    artist.members.forEach(member => {
        if (member.direction === 'backward' && member.type === 'member of band') {
            if (!memberIds.has(member.id)) {
                memberIds.add(member.id);
                buckets.groupMembers.push(mapMember(member));
            }
            return;
        }

        if (member.direction === 'forward' && member.type === 'member of band') {
            if (!groupIds.has(member.id)) {
                groupIds.add(member.id);
                buckets.memberOfGroups.push(mapMember(member));
            }
            return;
        }

        if (member.type === 'subgroup' && member.direction === 'forward') {
            if (!subgroupParentIds.has(member.id)) {
                subgroupParentIds.add(member.id);
                buckets.subgroupOf.push(mapMember(member));
            }
            return;
        }

        if (member.type === 'subgroup' && member.direction === 'backward') {
            if (!subgroupChildIds.has(member.id)) {
                subgroupChildIds.add(member.id);
                buckets.subgroups.push(mapMember(member));
            }
        }
    });

    const relatedIds = new Set<string>();
    (artist.relatedArtists ?? []).forEach(relation => {
        if (relatedIds.has(relation.id)) {
            return;
        }
        relatedIds.add(relation.id);
        buckets.related.push(mapRelatedArtist(relation));
    });

    return buckets;
}

export function hasArtistRelationships(relationships: ArtistRelationshipBuckets): boolean {
    return Object.values(relationships).some(bucket => bucket.length > 0);
}

export function buildArtistRelationshipGroups(
    relationships: ArtistRelationshipBuckets
): ArtistRelationshipGroup[] {
    return [
        { title: 'Members', data: relationships.groupMembers },
        { title: 'Member Of', data: relationships.memberOfGroups },
        { title: 'Subgroups', data: relationships.subgroups },
        { title: 'Parent Groups', data: relationships.subgroupOf },
        { title: 'Related Artists', data: relationships.related }
    ].filter(group => group.data.length > 0);
}
