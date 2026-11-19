import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { installFetch } from './helpers/daprTestHelpers.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-lyrics-'));
const lyricsPath = path.join(directory, 'lyrics.db');
process.env.LYRICS_DB_PATH = lyricsPath;
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.LYRICS_TRANSIENT_RETRY_MS = '60000';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

type StubState = {
    geniusHits?: unknown[];
    geniusStatus?: number;
    recordingRelations?: unknown[];
    recordingStatus?: number;
    workRelations?: unknown[];
};

const installProviderStub = (state: StubState) => {
    const calls: string[] = [];
    installFetch((url) => {
        calls.push(url);
        if (url.includes('/v1.0/secrets/pawify-secrets/genius-access-token')) {
            return jsonResponse({ 'genius-access-token': 'token' });
        }
        if (url.includes('/v1.0/invoke/genius/method/search')) {
            if (state.geniusStatus && state.geniusStatus >= 400) {
                return jsonResponse({ error: 'upstream' }, state.geniusStatus);
            }
            return jsonResponse({ response: { hits: state.geniusHits ?? [] } });
        }
        if (url.includes('/v1.0/invoke/musicbrainz/method/ws/2/recording/')) {
            return jsonResponse(
                { relations: state.recordingRelations ?? [] },
                state.recordingStatus ?? 200,
            );
        }
        if (url.includes('/v1.0/invoke/musicbrainz/method/ws/2/work/')) {
            return jsonResponse({ relations: state.workRelations ?? [] });
        }
        throw new Error(`unexpected provider call ${url}`);
    });
    return calls;
};

const geniusHit = {
    result: {
        artist_names: 'Artist One',
        title: 'Song One',
        lyrics_state: 'complete',
        url: 'https://genius.com/artist-one-song-one-lyrics',
    },
};

const mbLyricsRelation = {
    type: 'lyrics',
    url: { resource: 'https://www.genius.com/artist-one-song-one-lyrics' },
};

const request = {
    recordingId: 'recording-1',
    artistName: 'Artist One',
    trackName: 'Song One',
};

const loadModules = async () => {
    const client = await import('../src/infrastructure/lyricsDb/lyricsDbClient.js');
    const repo = await import('../src/infrastructure/lyricsDb/lyricsStateRepository.js');
    const resolver = await import('../src/services/lyrics/lyricsResolver.js');
    const secrets = await import('../src/infrastructure/dapr/daprSecrets.js');
    return { client, repo, resolver, secrets };
};

before(async () => {
    const { client } = await loadModules();
    client.createLyricsDatabase(lyricsPath);
});

beforeEach(async () => {
    const { client, resolver, secrets } = await loadModules();
    client.closeLyricsDb();
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${lyricsPath}${suffix}`, { force: true });
    }
    client.createLyricsDatabase(lyricsPath);
    secrets.clearDaprSecretCache();
    resolver.resetLyricsResolverForTests();
});

after(async () => {
    const { client } = await loadModules();
    client.closeLyricsDb();
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('persistent lyrics lookup state', () => {
    it('reuses a stored hit without any provider call', async () => {
        const { repo, resolver } = await loadModules();
        repo.recordLyricsFound(request, 'https://genius.com/stored', 'genius', {
            geniusAttempted: true,
            musicbrainzAttempted: false,
        });
        const calls = installProviderStub({});

        const result = await resolver.resolveLyrics(request);

        assert.deepEqual(result, {
            url: 'https://genius.com/stored',
            outcome: 'found',
            provider: 'stored',
        });
        assert.deepEqual(calls, []);
    });

    it('returns a stored confirmed miss without provider calls', async () => {
        const { repo, resolver } = await loadModules();
        repo.recordLyricsConfirmedMiss(request, {
            geniusAttempted: true,
            musicbrainzAttempted: true,
        });
        const calls = installProviderStub({});

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.url, null);
        assert.equal(result.outcome, 'confirmed-miss');
        assert.deepEqual(calls, []);
    });

    it('does not destroy a found URL when a refresh fails', async () => {
        const { repo, resolver } = await loadModules();
        const { openLyricsDb } = await import('../src/infrastructure/lyricsDb/lyricsDbClient.js');
        repo.recordLyricsFound(request, 'https://genius.com/good', 'genius', {
            geniusAttempted: true,
            musicbrainzAttempted: false,
        });

        // Make the success row due for a refresh, then fail both providers.
        const db = openLyricsDb(lyricsPath);
        db.prepare('UPDATE lyrics_lookup_state SET next_attempt_at = 0').run();
        db.close();
        installProviderStub({ geniusStatus: 503, recordingStatus: 503 });

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.url, 'https://genius.com/good');
        assert.equal(result.outcome, 'found');
        const state = repo
            .readLyricsStates([request])
            .get(repo.buildDurableLyricsLookupIdentity(request).lookupKey);
        assert.equal(state?.outcome, 'found');
        assert.equal(state?.resolvedUrl, 'https://genius.com/good');
        assert.ok(
            (state?.nextAttemptAt ?? 0) - Date.now() > 24 * 60 * 60 * 1000,
            'preserved found URLs use a bounded long refresh policy, not the 5-minute transient window',
        );
    });

    it('records a Genius-only miss as retryable when no recording identity exists', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [] });
        const noRecording = { ...request, recordingId: null };

        const result = await resolver.resolveLyrics(noRecording);

        assert.equal(result.outcome, 'failure');
        const state = repo
            .readLyricsStates([noRecording])
            .get(repo.buildDurableLyricsLookupIdentity(noRecording).lookupKey);
        assert.equal(state?.outcome, 'transient-failure');
    });

    it('persists a Genius hit and skips MusicBrainz', async () => {
        const { resolver } = await loadModules();
        const calls = installProviderStub({ geniusHits: [geniusHit] });

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.provider, 'genius');
        assert.equal(result.url, geniusHit.result.url);
        assert.equal(calls.filter((url) => url.includes('/invoke/musicbrainz/')).length, 0);

        const callsAfterHit = installProviderStub({});
        assert.equal((await resolver.resolveLyrics(request)).url, geniusHit.result.url);
        assert.deepEqual(callsAfterHit, []);
    });

    it('falls back to MusicBrainz lyrics relations after a Genius miss', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({
            geniusHits: [],
            recordingRelations: [mbLyricsRelation],
        });

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.outcome, 'found');
        assert.equal(result.provider, 'musicbrainz');
        assert.equal(result.url, mbLyricsRelation.url.resource);
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/method/ws/2/recording/'))
                .length,
            1,
        );

        const state = repo
            .readLyricsStates([request])
            .get(repo.buildLyricsLookupIdentity(request).lookupKey);
        assert.equal(state?.provider, 'musicbrainz');
        assert.equal(state?.recordingMbid, 'recording-1');
    });

    it('persists a dual confirmed miss only when both providers answered', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [], recordingRelations: [] });

        const result = await resolver.resolveLyrics(request);
        assert.equal(result.outcome, 'confirmed-miss');

        const state = repo
            .readLyricsStates([request])
            .get(repo.buildLyricsLookupIdentity(request).lookupKey);
        assert.equal(state?.outcome, 'confirmed-miss');
        assert.equal(state?.resolvedUrl, null);
    });

    it('keeps retryable state when a provider fails', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusStatus: 503, recordingStatus: 200, recordingRelations: [] });

        const result = await resolver.resolveLyrics(request);
        assert.equal(result.outcome, 'failure');
        assert.equal(result.url, undefined);

        const state = repo
            .readLyricsStates([request])
            .get(repo.buildLyricsLookupIdentity(request).lookupKey);
        assert.equal(state?.outcome, 'transient-failure');
    });

    it('does not call a provider after cancellation', async () => {
        const { resolver } = await loadModules();
        const calls = installProviderStub({});
        const controller = new AbortController();
        controller.abort();

        const result = await resolver.resolveLyrics(request, controller.signal);

        assert.equal(result.outcome, 'failure');
        assert.deepEqual(calls, []);
    });

    it('deduplicates concurrent resolution for the same durable lookup', async () => {
        const { resolver } = await loadModules();
        const calls = installProviderStub({ geniusHits: [geniusHit] });

        const [first, second] = await Promise.all([
            resolver.resolveLyrics(request),
            resolver.resolveLyrics(request),
        ]);

        assert.equal(first.url, geniusHit.result.url);
        assert.equal(second.url, geniusHit.result.url);
        assert.equal(calls.filter((url) => url.includes('/invoke/genius/method/search')).length, 1);
    });

    it('keeps variant fingerprints separate for changed credits', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [geniusHit] });

        await resolver.resolveLyrics(request);
        const variant = { ...request, artistName: 'Different Artist' };
        const state = repo
            .readLyricsStates([variant])
            .get(repo.buildLyricsLookupIdentity(variant).lookupKey);

        assert.equal(state, undefined);
    });

    it('follows a local recording MBID redirect without deleting the old row', async () => {
        const { repo, resolver } = await loadModules();
        const mirror = await import('../src/infrastructure/musicDb/musicDbClient.js');
        const { createMusicDbFixture } = await import('./helpers/musicDbFixture.js');
        const { openLyricsDb } = await import('../src/infrastructure/lyricsDb/lyricsDbClient.js');

        const mirrorPath = createMusicDbFixture();
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(mirrorPath);
        db.exec(
            'CREATE TABLE mbid_redirects (entity_type TEXT NOT NULL, old_mbid TEXT NOT NULL, new_mbid TEXT NOT NULL)',
        );
        db.prepare('INSERT INTO mbid_redirects VALUES (?, ?, ?)').run(
            'recording',
            'old-recording',
            'recording-1',
        );
        db.close();

        const previousPath = process.env.MUSIC_DB_PATH;
        process.env.MUSIC_DB_PATH = mirrorPath;
        mirror.closeMusicDb();

        try {
            repo.recordLyricsFound(
                request,
                'https://genius.com/redirected',
                'genius',
                { geniusAttempted: true, musicbrainzAttempted: false },
            );
            const calls = installProviderStub({});

            const result = await resolver.resolveLyrics({
                ...request,
                recordingId: 'old-recording',
            });

            assert.equal(result.url, 'https://genius.com/redirected');
            assert.deepEqual(calls, []);

            const rows = openLyricsDb(lyricsPath);
            const count = rows
                .prepare('SELECT count(*) AS n FROM lyrics_lookup_state')
                .get() as { n: number };
            rows.close();
            assert.equal(count.n, 1, 'the old durable row is retained, not moved or deleted');
        } finally {
            mirror.closeMusicDb();
            if (previousPath === undefined) delete process.env.MUSIC_DB_PATH;
            else process.env.MUSIC_DB_PATH = previousPath;
            fs.rmSync(path.dirname(mirrorPath), { recursive: true, force: true });
        }
    });

    it('keeps using an old-identity row when the redirect target has no row yet', async () => {
        const { repo, resolver } = await loadModules();
        const mirror = await import('../src/infrastructure/musicDb/musicDbClient.js');
        const { createMusicDbFixture } = await import('./helpers/musicDbFixture.js');
        const Database = (await import('better-sqlite3')).default;

        const mirrorPath = createMusicDbFixture();
        const db = new Database(mirrorPath);
        db.exec(
            'CREATE TABLE mbid_redirects (entity_type TEXT NOT NULL, old_mbid TEXT NOT NULL, new_mbid TEXT NOT NULL)',
        );
        db.prepare('INSERT INTO mbid_redirects VALUES (?, ?, ?)').run(
            'recording',
            'old-recording',
            'canonical-recording',
        );
        db.close();

        const previousPath = process.env.MUSIC_DB_PATH;
        process.env.MUSIC_DB_PATH = mirrorPath;
        mirror.closeMusicDb();

        try {
            repo.recordLyricsFound(
                { ...request, recordingId: 'old-recording' },
                'https://genius.com/old-identity',
                'genius',
                { geniusAttempted: true, musicbrainzAttempted: false },
            );
            const calls = installProviderStub({});

            const result = await resolver.resolveLyrics({
                ...request,
                recordingId: 'old-recording',
            });

            assert.equal(result.url, 'https://genius.com/old-identity');
            assert.deepEqual(calls, []);
        } finally {
            mirror.closeMusicDb();
            if (previousPath === undefined) delete process.env.MUSIC_DB_PATH;
            else process.env.MUSIC_DB_PATH = previousPath;
            fs.rmSync(path.dirname(mirrorPath), { recursive: true, force: true });
        }
    });

    it('reports the rows actually removed by housekeeping', async () => {
        const { repo } = await loadModules();
        const { openLyricsDb } = await import('../src/infrastructure/lyricsDb/lyricsDbClient.js');
        repo.recordLyricsFound(request, 'https://genius.com/old', 'genius', {
            geniusAttempted: true,
            musicbrainzAttempted: false,
        });
        const db = openLyricsDb(lyricsPath);
        db.prepare('UPDATE lyrics_lookup_state SET checked_at = 0').run();
        db.close();

        const applied = repo.applyLyricsHousekeeping();
        assert.deepEqual(applied, {
            removableRows: 1,
            removableFound: 1,
            removableMisses: 0,
            removableFailures: 0,
        });
        assert.equal(repo.getLyricsStoreStats().rows, 0);
    });

    it('survives mirror replacement because the sidecar is a separate file', async () => {
        const { repo, resolver } = await loadModules();
        repo.recordLyricsFound(request, 'https://genius.com/durable', 'genius', {
            geniusAttempted: true,
            musicbrainzAttempted: false,
        });

        const mirrorDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-mirror-replace-'));
        const mirrorPath = path.join(mirrorDirectory, 'mb.db');
        fs.writeFileSync(mirrorPath, 'not the same mirror');
        const calls = installProviderStub({});

        const result = await resolver.resolveLyrics(request);
        assert.equal(result.url, 'https://genius.com/durable');
        assert.deepEqual(calls, []);
        assert.equal(fs.existsSync(lyricsPath), true);

        fs.rmSync(mirrorDirectory, { recursive: true, force: true });
    });
});
