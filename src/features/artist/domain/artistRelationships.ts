import type { Artist, Member } from '../../../modules/models/models';
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

export function getArtistRelationshipBuckets(artist: Artist): ArtistRelationshipBuckets {
    const memberIds = new Set<string>();
    const groupIds = new Set<string>();
    const subgroupParentIds = new Set<string>();
    const subgroupChildIds = new Set<string>();

    const buckets: ArtistRelationshipBuckets = {
        groupMembers: [],
        memberOfGroups: [],
        subgroupOf: [],
        subgroups: []
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
        { title: 'Parent Groups', data: relationships.subgroupOf }
    ].filter(group => group.data.length > 0);
}
