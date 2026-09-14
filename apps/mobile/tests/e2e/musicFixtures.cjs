const artistId = 'pawify-e2e-artist-aurora';
const releaseGroupId = 'pawify-e2e-rg-midnight-signals';
const releaseId = 'pawify-e2e-release-midnight-signals';
const relatedArtistId = 'pawify-e2e-artist-nova';

const artistCredit = [
  {
    artist: {
      id: artistId,
      name: 'Aurora Test Ensemble',
    },
    joinphrase: '',
  },
];

const artist = {
  id: artistId,
  name: 'Aurora Test Ensemble',
  type: 'Group',
  disambiguation: 'Pawify E2E Fixture',
  aliases: [
    { name: 'ATE Fixture' },
  ],
  relations: [
    {
      type: 'member of band',
      direction: 'backward',
      'target-type': 'artist',
      artist: {
        id: relatedArtistId,
        name: 'Nova Fixture',
      },
    },
  ],
  'life-span': {
    begin: '2018-01-01',
    end: null,
    ended: false,
  },
  'begin-area': {
    name: 'Oslo, Norway',
  },
};

const releaseGroup = {
  id: releaseGroupId,
  title: 'Midnight Signals',
  'first-release-date': '2025-04-18',
  'primary-type': 'Album',
  disambiguation: null,
  'artist-credit': artistCredit,
};

const release = {
  id: releaseId,
  title: 'Midnight Signals',
  date: '2025-04-18',
  disambiguation: null,
  'release-group': releaseGroup,
  'artist-credit': artistCredit,
  media: [
    {
      format: 'Digital Media',
      'track-count': 2,
      tracks: [
        {
          id: 'pawify-e2e-track-signal-drift',
          title: 'Signal Drift',
          length: 187000,
          'artist-credit': artistCredit,
        },
        {
          id: 'pawify-e2e-track-skyline-loop',
          title: 'Skyline Loop',
          length: 214000,
          'artist-credit': artistCredit,
        },
      ],
    },
  ],
  relations: [
    {
      type: 'streaming',
      'target-type': 'url',
      url: { resource: 'https://open.spotify.com/album/pawify-e2e-midnight-signals' },
    },
  ],
};

const relatedArtist = {
  id: relatedArtistId,
  name: 'Nova Fixture',
  type: 'Person',
  disambiguation: 'Pawify E2E Related Fixture',
  aliases: [],
  relations: [],
  'life-span': {
    begin: '1995-06-01',
    end: null,
    ended: false,
  },
};

const artistSearchResponse = {
  artists: [
    {
      id: artist.id,
      name: artist.name,
    },
  ],
  count: 1,
};

const releaseSearchResponse = {
  releases: [release],
  'release-count': 1,
};

module.exports = {
  artist,
  artistId,
  artistSearchResponse,
  release,
  releaseGroup,
  releaseGroupId,
  releaseId,
  releaseSearchResponse,
  relatedArtist,
  relatedArtistId,
};
