import { describe, expect, it } from 'vitest';
import type { Artist, Member } from '@pawify/shared';
import {
  buildArtistRelationshipGroups,
  getArtistRelationshipBuckets,
  hasArtistRelationships,
} from './artistRelationships';

function member(overrides: Partial<Member> & Pick<Member, 'id' | 'name'>): Member {
  return {
    begin: null,
    end: null,
    artistType: 'Person',
    type: 'member of band',
    direction: 'backward',
    ...overrides,
  };
}

function artistWithMembers(members: Member[]): Artist {
  return {
    id: 'artist',
    name: 'Artist',
    type: 'Group',
    disambiguation: null,
    aliases: [],
    members,
    externalLinks: [],
    lifeSpan: { begin: null, end: null, ended: false },
    beginArea: { name: null },
  };
}

describe('artist relationships', () => {
  it('buckets member and subgroup relationships by type and direction without duplicates', () => {
    const buckets = getArtistRelationshipBuckets(artistWithMembers([
      member({ id: 'person-1', name: 'Member A' }),
      member({ id: 'person-1', name: 'Member A duplicate' }),
      member({ id: 'group-1', name: 'Parent Group', direction: 'forward' }),
      member({ id: 'parent-1', name: 'Parent Subgroup', type: 'subgroup', direction: 'forward' }),
      member({ id: 'child-1', name: 'Child Subgroup', type: 'subgroup', direction: 'backward' }),
    ]));

    expect(buckets.groupMembers).toEqual([
      { id: 'person-1', name: 'Member A', begin: null, end: null },
    ]);
    expect(buckets.memberOfGroups).toEqual([
      { id: 'group-1', name: 'Parent Group', begin: null, end: null },
    ]);
    expect(buckets.subgroupOf).toEqual([
      { id: 'parent-1', name: 'Parent Subgroup', begin: null, end: null },
    ]);
    expect(buckets.subgroups).toEqual([
      { id: 'child-1', name: 'Child Subgroup', begin: null, end: null },
    ]);
  });

  it('builds display groups only for populated relationship buckets', () => {
    const emptyBuckets = getArtistRelationshipBuckets(artistWithMembers([]));
    const populatedBuckets = getArtistRelationshipBuckets(artistWithMembers([
      member({ id: 'person-1', name: 'Member A' }),
      member({ id: 'group-1', name: 'Parent Group', direction: 'forward' }),
    ]));

    expect(hasArtistRelationships(emptyBuckets)).toBe(false);
    expect(buildArtistRelationshipGroups(populatedBuckets).map(group => group.title)).toEqual([
      'Members',
      'Member Of',
    ]);
  });
});
