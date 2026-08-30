import {
    Artist,
    ArtistMinimal,
    ArtistCredit,
    Media,
    NewRelease,
    Release,
    ReleaseGroup,
    ReleaseResult,
    Track,
} from '../../modules/models/models.js';
import { formatDate } from '../../modules/utils/dateUtil.js';
import { mapRelationsToExternalLinks } from '../../utils/helpers/externalLinks.js';

const mapToArtistMinimal = (data: any): ArtistMinimal => ({
    id: data.id,
    name: data.name,
});

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

const mapToTrack = (data: any): Track => ({
    id: data.id,
    title: data.title,
    'artist-credit': data['artist-credit']?.map(mapToArtistCredit) ?? [],
    length: data.length ?? null,
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

export const mapToReleaseResult = (data: any, artistId?: string): ReleaseResult => ({
    releases: data.releases?.map((d: any) => mapToRelease(d, artistId)) ?? [],
    'release-count': data['release-count'],
});
