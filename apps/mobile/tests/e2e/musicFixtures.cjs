const artistId = 'pawify-e2e-artist-aurora';
const releaseGroupId = 'pawify-e2e-rg-midnight-signals';
const releaseId = 'pawify-e2e-release-midnight-signals';

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
  relations: [],
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
  relations: [],
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
};
