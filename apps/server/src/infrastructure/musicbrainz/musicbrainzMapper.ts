import {
    Artist,
    ArtistMinimal,
    ArtistCredit,
    Media,
    NewRelease,
    Release,
    ReleaseGroup,
    Track,
} from '@pawify/shared';
import { formatDate } from '@pawify/shared';
import { mapRelationsToExternalLinks } from '../../utils/helpers/externalLinks.js';

const mapToArtistMinimal = (data: any): ArtistMinimal => ({
    id: data.id,
    name: data.name,
});

/**
 * Artist-artist relation types surfaced for discovery. Membership relations
 * ('member of band', 'subgroup') already render in the members section; this
 * set covers the creative/personal links that answer "who else should I
 * follow": collaborators, remixers, producers, supporting/session roles,
 * side-projects, and family links.
 */
const RELATED_ARTIST_RELATION_TYPES = new Set([
    'collaboration',
    'remixer',
    'producer',
    'instrumental supporting musician',
    'vocal supporting musician',
    'supporting musician',
    'conductor',
    'DJ-mix',
    'samples from artist',
    'tribute',
    'is person',
    'parent',
    'sibling',
    'married',
    'named after',
    'teacher',
    'student',
    'involved with',
]);

export const mapToArtist = (data: any): Artist => ({
    ...mapToArtistMinimal(data),
    type: data.type,
    disambiguation: data.disambiguation ?? null,
    aliases: data.aliases?.map((alias: any) => ({ name: alias.name })) ?? [],
    externalLinks: mapRelationsToExternalLinks(data.relations),
    members:
        data.relations
            ?.filter((rel: any) => rel.type === 'member of band' || rel.type === 'subgroup')
            .map((rel: any) => ({
                id: rel.artist.id,
                name: rel.artist.name,
                begin: rel.begin,
                end: rel.end,
                artistType: rel.artist.type,
                type: rel.type,
                direction: rel.direction,
            })) ?? [],
    relatedArtists:
        data.relations
            ?.filter(
                (rel: any) =>
                    RELATED_ARTIST_RELATION_TYPES.has(rel.type) &&
                    typeof rel.artist?.id === 'string' &&
                    typeof rel.artist?.name === 'string',
            )
            .map((rel: any) => ({
                id: rel.artist.id,
                name: rel.artist.name,
                type: rel.type,
                direction: rel.direction,
                artistType: rel.artist.type,
            })) ?? [],
    lifeSpan: {
        begin: data['life-span']?.begin ?? null,
        end: data['life-span']?.end ?? null,
        ended: data['life-span']?.ended ?? false,
    },
    beginArea: {
        name: data['begin-area']?.name ?? null,
    },
});

const mapToArtistCredit = (data: any): ArtistCredit => ({
    ...mapToArtistMinimal(data.artist),
    joinphrase: data.joinphrase ?? null,
});

/**
 * MusicBrainz's "lyrics" URL relationship type.
 *
 * Editors attach it to the recording or, more often, to the work the recording
 * performs, which is why both levels are inspected.
 */
const LYRICS_RELATION_TYPE_ID = 'e38e65aa-75e0-42ba-ace0-072aeb91a538';

const isLyricsRelation = (relation: any): boolean =>
    relation?.type === 'lyrics' || relation?.['type-id'] === LYRICS_RELATION_TYPE_ID;

const lyricsUrlFromRelations = (relations: unknown): string | null => {
    if (!Array.isArray(relations)) {
        return null;
    }

    const urls: string[] = [];
    for (const relation of relations) {
        if (!isLyricsRelation(relation)) {
            continue;
        }
        const resource = relation?.url?.resource;
        if (typeof resource === 'string' && /^https?:\/\//i.test(resource.trim())) {
            urls.push(resource.trim());
        }
    }

    if (urls.length === 0) {
        return null;
    }

    // Genius first: it is Pawify's primary lyrics provider, so a Genius link keeps
    // the in-app experience consistent. Any other whitelisted site is the fallback.
    return urls.find((url) => url.includes('genius.com')) ?? urls[0]!;
};

/**
 * Lyrics URL for one track, from the recording's relations or its work's relations.
 *
 * Both levels are needed: MusicBrainz editors commonly attach the lyrics link to the
 * work ("Paranoid Android" is a work; the release track is a recording of it).
 */
const lyricsUrlForRecording = (recording: any): string | null => {
    const direct = lyricsUrlFromRelations(recording?.relations);
    if (direct) {
        return direct;
    }

    const relations = Array.isArray(recording?.relations) ? recording.relations : [];
    for (const relation of relations) {
        if (relation?.['target-type'] !== 'work' || !relation.work) {
            continue;
        }
        const fromWork = lyricsUrlFromRelations(relation.work.relations);
        if (fromWork) {
            return fromWork;
        }
    }

    return null;
};

const mapToTrack = (data: any): Track => ({
    id: data.id,
    title: data.title,
    'artist-credit': data['artist-credit']?.map(mapToArtistCredit) ?? [],
    length: data.length ?? null,
    lyricsUrl: lyricsUrlForRecording(data.recording),
});

const mapToMedia = (data: any): Media => ({
    'track-count': data['track-count'],
    tracks: data.tracks?.map(mapToTrack) ?? [],
});

export const getPrimaryArtistId = (data: any): string => {
    const artistId = data?.['artist-credit']?.[0]?.artist?.id;
    return typeof artistId === 'string' ? artistId : '';
};

export const mapToRelease = (data: any, artistId: string = getPrimaryArtistId(data)): Release => {
    const media = [];
    const filteredMedia = data.media?.filter((m: any) => m.tracks && m.tracks.length > 0) ?? [];

    for (const m of filteredMedia) {
        const resolvedMedia = mapToMedia(m);
        media.push(resolvedMedia);
    }

    const releaseGroupData = data['release-group'];
    const releaseGroup: ReleaseGroup | null = releaseGroupData
        ? {
              'primary-type': releaseGroupData['primary-type'] ?? null,
              id: releaseGroupData.id,
              title: releaseGroupData.title,
              date: releaseGroupData['first-release-date'] ?? null,
              disambiguation: releaseGroupData.disambiguation ?? null,
          }
        : null;

    const date = data.date ?? null;
    const date_for_display = formatDate(date);

    return {
        id: data.id,
        title: data.title,
        artistId,
        date,
        releaseGroupId: releaseGroup?.id ?? null,
        cover_url: undefined,
        date_for_display,
        disambiguation: data.disambiguation ?? null,
        'release-group': releaseGroup,
        'artist-credit': data['artist-credit']?.map(mapToArtistCredit) ?? [],
        media,
        externalLinks: mapRelationsToExternalLinks(data.relations),
    };
};

const mapArtistsById = (artistCredits: ArtistCredit[]): { [artistId: string]: string } =>
    artistCredits.reduce<{ [artistId: string]: string }>((acc, credit) => {
        if (credit.id && credit.name) {
            acc[credit.id] = credit.name;
        }

        return acc;
    }, {});

export const mapToNewRelease = (release: Release): NewRelease => ({
    id: release.id,
    title: release.title,
    date: release.date,
    disambiguation: release.disambiguation,
    artists: mapArtistsById(release['artist-credit'] ?? []),
    date_for_display: release.date_for_display,
    'primary-type': release['release-group']?.['primary-type'] ?? null,
});

export interface ReleaseResult {
    releases: Release[];
    'release-count': number;
}

export const mapToReleaseResult = (data: any, artistId?: string): ReleaseResult => ({
    releases: data.releases?.map((d: any) => mapToRelease(d, artistId)) ?? [],
    'release-count': data['release-count'],
});
