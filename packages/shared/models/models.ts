export type RemoteValueState = string | null | undefined;

export type ExternalLinkCategory =
  | "streaming"
  | "social"
  | "database"
  | "lyrics"
  | "live"
  | "store"
  | "official"
  | "other";

export type ExternalLinkService =
  | "spotify"
  | "appleMusic"
  | "youtube"
  | "youtubeMusic"
  | "bandcamp"
  | "soundcloud"
  | "tidal"
  | "deezer"
  | "qobuz"
  | "amazonMusic"
  | "beatport"
  | "discogs"
  | "wikidata"
  | "wikipedia"
  | "allMusic"
  | "rateYourMusic"
  | "lastFm"
  | "genius"
  | "setlistFm"
  | "songkick"
  | "bandsintown"
  | "instagram"
  | "facebook"
  | "myspace"
  | "tumblr"
  | "x"
  | "tiktok"
  | "patreon"
  | "linktree"
  | "official"
  | "other";

export interface ExternalLink {
  service: ExternalLinkService;
  label: string;
  url: string;
  icon: ExternalLinkService;
  category: ExternalLinkCategory;
}

export interface ArtistCredit extends ArtistMinimal {
  joinphrase: string | null;
}

interface ReleaseBase {
  id: string;
  title: string;
  date: string | null;
  disambiguation: string | null;
}

export interface ReleaseGroup extends ReleaseBase {
  "primary-type": string | null;
}

export interface NewRelease {
  /** Release id. For a release-group entry this is the group's newest release. */
  id: string;
  title: string;
  date: string | null;
  disambiguation: string | null;
  artists: { [artistId: string]: string };
  date_for_display: string;
  "primary-type": string | null;
  /**
   * Release-group identity. New-release detection and notifications are keyed by
   * this, not by release id: one album can exist as several MusicBrainz releases
   * (digital, CD, vinyl, regional pressings) and each used to notify separately.
   */
  releaseGroupId?: string | null;
  /** How many releases the group holds; 1 means the tap goes straight to `id`. */
  releaseCount?: number;
  /**
   * Official edition that produced this event, when the event came from edition
   * content rather than from the group's first appearance.
   */
  trackCount?: number | null;
  /** Edition keywords (`deluxe`, `remaster`, ...) carried by the event edition. */
  editionKeywords?: string[];
  /** Why detection emitted this entry; used by clients to explain the event. */
  notificationReason?: 'new-group' | 'more-tracks' | 'new-edition';
}

export interface ArtistReleaseGroup extends ReleaseGroup {
  releaseIds: string[];
}

export interface Release extends ReleaseBase {
  artistId: string;
  date_for_display: string;
  "release-group": ReleaseGroup | null;
  "artist-credit": ArtistCredit[];
  media: Media[];
  barcode?: string | null;
  status?: string | null;
  country?: string | null;
  releaseGroupId: string | null;
  cover_url: RemoteValueState;
  externalLinks: ExternalLink[];
}

export interface Media {
  "track-count": number;
  format?: string | null;
  position?: number;
  tracks: Track[] | null;
}

export interface Track {
  id: string;
  number?: string | null;
  title: string;
  "artist-credit": ArtistCredit[];
  length: number | null;
  /**
   * Lyrics URL MusicBrainz already knows for this track.
   *
   * Sourced from the recording's own `url-rels` or its work's `url-rels`
   * (Genius first, then any other whitelisted lyrics site), so the tracklist
   * request answers lyrics for free instead of costing a Genius API call.
   */
  lyricsUrl?: string | null;
}

export interface ArtistMinimal {
  id: string;
  name: string;
}

export interface Artist extends ArtistMinimal {
  type: "Person" | "Group";
  disambiguation: string | null;
  aliases: { name: string }[];
  members: Member[];
  /** Non-membership artist relations (collaborations, remixes, production,
   * family, side-projects) used for artist discovery. May be absent in
   * responses/caches written before this field existed. */
  relatedArtists?: ArtistRelation[];
  externalLinks: ExternalLink[];
  lifeSpan: {
    begin: string | null;
    end: string | null;
    ended: boolean;
  };
  beginArea: {
    name: string | null;
  };
}

export interface Member {
  id: string;
  name: string;
  begin: string | null;
  end: string | null;
  artistType: "Person" | "Group";
  type: "member of band" | "subgroup";
  direction: "forward" | "backward"
}

export interface ArtistRelation {
  id: string;
  name: string;
  /** Raw MusicBrainz artist-artist relation type (e.g. "remixer"). */
  type: string;
  direction: "forward" | "backward";
  artistType: "Person" | "Group";
}




export type ReleaseNotificationSettings = {
  oldestReleaseDateMonths: number | null;
  includeReleasesWithoutDate: boolean;
};

export const DEFAULT_RELEASE_NOTIFICATION_SETTINGS: ReleaseNotificationSettings = {
  oldestReleaseDateMonths: 12,
  includeReleasesWithoutDate: true,
};



export type NewReleaseCoverTaskResult = {
  covers: { [releaseId: string]: RemoteValueState };
};


export type ReleaseGroupReleaseListItem = {
  id: string;
  title: string;
  /** Release date as MusicBrainz returns it (e.g. `2025-03-14` or `2025-03`), null when unknown. */
  date: string | null;
  /** Total media track count; null when the release has no media metadata. */
  trackCount: number | null;
  /** Distinct non-empty media formats (e.g. `['CD', 'DVD']`). */
  formats: string[];
  /** Release country, shown on the individual release screen. */
  country: string | null;
  /** MusicBrainz release status; Official is intentionally never displayed as a chip. */
  status: string | null;
};
