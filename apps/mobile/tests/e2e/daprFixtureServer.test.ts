import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type DaprFixtureServer = {
  close: () => Promise<void>;
  url: string;
};

type DaprFixtureModule = {
  startDaprFixtureServer: () => Promise<DaprFixtureServer>;
};

const require = createRequire(import.meta.url);
const { startDaprFixtureServer } = require('./daprFixtureServer.cjs') as DaprFixtureModule;

describe('Dapr e2e fixture server', () => {
  it('serves deterministic MusicBrainz artist and release data through Dapr invoke URLs', async () => {
    const server = await startDaprFixtureServer();

    try {
      const artistSearch = await fetch(
        `${server.url}/v1.0/invoke/musicbrainz/method/ws/2/artist?query=Aurora&fmt=json&limit=25&offset=0`
      );
      await expect(artistSearch.json()).resolves.toMatchObject({
        artists: [
          {
            id: 'pawify-e2e-artist-aurora',
            name: 'Aurora Test Ensemble',
          },
        ],
        count: 1,
      });

      const releases = await fetch(
        `${server.url}/v1.0/invoke/musicbrainz/method/ws/2/release?artist=pawify-e2e-artist-aurora&fmt=json&inc=release-groups`
      );
      await expect(releases.json()).resolves.toMatchObject({
        releases: [
          {
            id: 'pawify-e2e-release-midnight-signals',
            title: 'Midnight Signals',
            media: [
              {
                tracks: [
                  { title: 'Signal Drift' },
                  { title: 'Skyline Loop' },
                ],
              },
            ],
          },
        ],
        'release-count': 1,
      });
    } finally {
      await server.close();
    }
  });

  it('returns cover art misses as explicit 404 responses', async () => {
    const server = await startDaprFixtureServer();

    try {
      const cover = await fetch(
        `${server.url}/v1.0/invoke/coverartarchive/method/release/pawify-e2e-release-midnight-signals/front`,
        { method: 'HEAD' }
      );

      expect(cover.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('stores and reads Dapr state values in memory', async () => {
    const server = await startDaprFixtureServer();

    try {
      await expect(fetch(`${server.url}/v1.0/state/pawify-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            key: 'artist-cache',
            value: JSON.stringify({ name: 'Aurora Test Ensemble' }),
          },
        ]),
      })).resolves.toMatchObject({ status: 204 });

      const storedValue = await fetch(`${server.url}/v1.0/state/pawify-state/artist-cache`);
      await expect(storedValue.json()).resolves.toBe(JSON.stringify({
        name: 'Aurora Test Ensemble',
      }));

      await expect(fetch(`${server.url}/v1.0/state/pawify-state/artist-cache`, {
        method: 'DELETE',
      })).resolves.toMatchObject({ status: 204 });

      await expect(fetch(`${server.url}/v1.0/state/pawify-state/artist-cache`))
        .resolves
        .toMatchObject({ status: 204 });
    } finally {
      await server.close();
    }
  });
});
