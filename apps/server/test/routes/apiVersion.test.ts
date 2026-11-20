import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import express from 'express';
import { errorMiddleware } from '../../src/common/http/errorMiddleware.js';
import { closeMusicDb } from '../../src/infrastructure/musicDb/musicDbClient.js';
import { cleanupMusicDbFixtures, createMusicDbFixture } from '../helpers/musicDbFixture.js';
import { installAllFakes, startTestServer, stopTestServer } from '../helpers/httpTestApp.js';

let baseUrl: string;
before(async () => {
    installAllFakes();
    process.env.MUSIC_DB_PATH = createMusicDbFixture({
        releaseGroups: [{ id: 1, mbid: 'group', title: 'Group' }],
        releases: [{ id: 41, mbid: 'release', title: 'Album', release_group_mbid: 'group' }],
        media: [{ release_id: 41, position: 1, format: 'CD', track_count: 1 }],
        recordings: [{ id: 73, mbid: 'recording', title: 'Song' }],
        tracks: [{ id: 91, release_id: 41, medium_position: 1, position: 1, number: '1', recording_id: 73 }],
        recordingLyrics: [{ recording_id: 73, url: 'https://genius.com/example-lyrics', source: 'recording' }],
        entityImages: [{ entity_type: 'release', entity_mbid: 'release', service_id: 2, image_token: 'release', fetched_at: Math.floor(Date.now() / 1000) }],
    });
    const { registerRoutes } = await import('../../src/routes.js');
    const app = express();
    app.use(express.json());
    registerRoutes(app);
    app.use(errorMiddleware);
    baseUrl = await startTestServer(app);
});
after(async () => {
    await stopTestServer();
    closeMusicDb();
    cleanupMusicDbFixtures();
});

const post = (version: string, endpoint: string, body: object, auth = true) => fetch(
    `${baseUrl}/${version}/${endpoint}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer valid-token' } : {}) }, body: JSON.stringify(body) },
);

it('mounts all three versions and keeps the unversioned health check', async () => {
    for (const prefix of ['', '/v1', '/v2', '/v3']) {
        assert.equal((await fetch(baseUrl + prefix + '/health')).status, 200);
    }
});

it('serves split releases to v1/v2 and unified releases only to v3', async () => {
    for (const version of ['v1', 'v2']) {
        const header = await post(version, 'getRelease', { releaseId: 'release' });
        assert.equal(header.status, 200);
        const headerBody = await header.json();
        assert.deepEqual(headerBody.release.media, []);
        assert.match(headerBody.release.cover_url, /coverartarchive.org/);
        assert.equal('releaseCoverTaskId' in headerBody, false);
        assert.equal('profileImages' in headerBody, version === 'v2');

        assert.equal((await post(version, 'getReleaseTracks', { releaseId: 'release' }, false)).status, 401);
        const tracks = await post(version, 'getReleaseTracks', { releaseId: 'release' });
        assert.equal(tracks.status, 200);
        const tracksBody = await tracks.json();
        assert.equal(tracksBody.media[0].tracks[0].id, 'release:1:1');
        assert.equal('recordingId' in tracksBody.media[0].tracks[0], false);
        if (version === 'v1') {
            assert.equal('trackLyrics' in tracksBody, false);
            const task = await post(version, 'getTaskResult', { taskId: tracksBody.lyricsTaskId });
            assert.equal(task.status, 200);
            assert.equal((await task.json()).result.tracks['release:1:1'], 'https://genius.com/example-lyrics');
        } else {
            assert.equal(tracksBody.trackLyrics['release:1:1'], 'https://genius.com/example-lyrics');
        }
    }
    const unified = await post('v3', 'getRelease', { releaseId: 'release' });
    assert.equal(unified.status, 200);
    assert.equal((await unified.json()).release.media[0].tracks[0].recordingId, 'recording');
    assert.equal((await post('v3', 'getReleaseTracks', { releaseId: 'release' })).status, 404);
});

it('keeps the old release-group shape separate from v3', async () => {
    for (const version of ['v1', 'v2', 'v3']) {
        const response = await post(version, 'getReleaseGroupReleases', { releaseGroupId: 'group' });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.releases[0].id, 'release');
        assert.equal('releaseGroup' in body, version === 'v3');
        assert.equal('releaseCovers' in body, version !== 'v1');
    }
});
