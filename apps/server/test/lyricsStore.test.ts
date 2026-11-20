import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import { installFetch } from './helpers/daprTestHelpers.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-lyrics-'));
const lyricsPath = path.join(directory, 'lyrics.db');
process.env.LYRICS_DB_PATH = lyricsPath;
process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';
process.env.RATE_LIMIT_FALLBACK_DELAY_MS = '1';
process.env.LYRICS_MISS_TTL_DAYS = '7';

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

/** Records every provider URL touched, so tests can assert on request counts. */
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

const performanceRelation = {
    type: 'performance',
    work: { id: 'work-1' },
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

/** Raw stored row, bypassing the repository so storage shape can be asserted. */
const readRawRow = async (lookupKey: string) => {
    const db = new Database(lyricsPath, { readonly: true });
    try {
        return db
            .prepare('SELECT lyrics_url, retry_after FROM lyrics_lookup_state WHERE lookup_key = ?')
            .get(lookupKey) as { lyrics_url: string | null; retry_after: number | null } | undefined;
    } finally {
        db.close();
    }
};

const resetStore = async () => {
    const { client, resolver, secrets } = await loadModules();
    client.closeLyricsDb();
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${lyricsPath}${suffix}`, { force: true });
    }
    client.createLyricsDatabase(lyricsPath);
    secrets.clearDaprSecretCache();
    resolver.resetLyricsResolverForTests();
};

before(async () => {
    const { client } = await loadModules();
    client.createLyricsDatabase(lyricsPath);
});

beforeEach(resetStore);

after(async () => {
    const { client } = await loadModules();
    client.closeLyricsDb();
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('lyrics URL storage shape', () => {
    it('reduces Genius and Genius-hosted fallback URLs to a path', async () => {
        const { compactLyricsUrlForStorage, expandStoredLyricsUrl } = await import(
            '../src/infrastructure/lyricsDb/lyricsUrlStorage.js'
        );
        const source = 'https://www.genius.com/Artist-song-lyrics?utm_source=x#frag';

        assert.equal(compactLyricsUrlForStorage(source), '/Artist-song-lyrics');
        assert.equal(
            expandStoredLyricsUrl('/Artist-song-lyrics'),
            'https://genius.com/Artist-song-lyrics',
        );
    });

    it('keeps only host and path for non-Genius fallback URLs', async () => {
        const { compactLyricsUrlForStorage, expandStoredLyricsUrl } = await import(
            '../src/infrastructure/lyricsDb/lyricsUrlStorage.js'
        );
        const source = 'https://www.azlyrics.com/lyrics/artist/song.html?ref=1#top';

        assert.equal(
            compactLyricsUrlForStorage(source),
            'azlyrics.com/lyrics/artist/song.html',
        );
        assert.equal(
            expandStoredLyricsUrl('azlyrics.com/lyrics/artist/song.html'),
            'https://azlyrics.com/lyrics/artist/song.html',
        );
    });
});

describe('persistent lyrics lookup state', () => {
    it('serves a stored URL with no provider call and never queues a refresh', async () => {
        const { repo, resolver } = await loadModules();
        repo.recordLyricsUrl(request, 'https://genius.com/stored');
        const calls = installProviderStub({});

        const first = await resolver.resolveLyrics(request);
        const second = await resolver.resolveLyrics(request);

        assert.deepEqual(first, {
            url: 'https://genius.com/stored',
            outcome: 'found',
            provider: 'stored',
        });
        assert.deepEqual(second, first, 'resolved lyrics do not expire');
        assert.deepEqual(calls, []);
    });

    it('stores a resolved Genius hit as a path and reads it back as a URL', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [geniusHit] });

        const result = await resolver.resolveLyrics(request);
        assert.equal(result.provider, 'genius');
        assert.equal(result.url, geniusHit.result.url);

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        const row = await readRawRow(lookupKey);
        assert.equal(row?.lyrics_url, '/artist-one-song-one-lyrics');
        assert.equal(row?.retry_after, null, 'a resolved row carries no retry gate');
    });

    it('stores a Genius URL reached through MusicBrainz relations in the same path form', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({
            geniusHits: [],
            recordingRelations: [mbLyricsRelation],
        });

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.outcome, 'found');
        assert.equal(result.provider, 'musicbrainz');
        assert.equal(result.url, 'https://genius.com/artist-one-song-one-lyrics');
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/method/ws/2/work/')).length,
            0,
            'a recording-level lyrics relation needs no work probe',
        );

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        assert.equal((await readRawRow(lookupKey))?.lyrics_url, '/artist-one-song-one-lyrics');
    });

    it('probes the linked work when the recording carries no lyrics relation', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({
            geniusHits: [],
            recordingRelations: [performanceRelation],
            workRelations: [mbLyricsRelation],
        });

        const result = await resolver.resolveLyrics(request);

        assert.equal(result.outcome, 'found');
        assert.equal(result.provider, 'musicbrainz');
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/method/ws/2/recording/')).length,
            1,
        );
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/method/ws/2/work/')).length,
            1,
        );

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        assert.equal((await readRawRow(lookupKey))?.lyrics_url, '/artist-one-song-one-lyrics');
    });

    it('holds a confirmed dual miss behind a retry gate and skips providers until then', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [], recordingRelations: [] });

        const first = await resolver.resolveLyrics(request);
        assert.equal(first.outcome, 'confirmed-miss');
        assert.equal(first.url, null);

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        const row = await readRawRow(lookupKey);
        assert.equal(row?.lyrics_url, null);
        assert.ok(
            (row?.retry_after ?? 0) > Date.now() + 6 * 24 * 60 * 60 * 1000,
            'a confirmed miss is held for the negative-TTL window',
        );

        const calls = installProviderStub({ geniusHits: [geniusHit] });
        const second = await resolver.resolveLyrics(request);
        assert.deepEqual(second, { url: null, outcome: 'confirmed-miss', provider: 'stored' });
        assert.deepEqual(calls, [], 'the gate is honoured, not re-probed');
    });

    it('retries a confirmed miss once its gate has passed', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusHits: [], recordingRelations: [] });
        await resolver.resolveLyrics(request);

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        const db = new Database(lyricsPath);
        db.prepare('UPDATE lyrics_lookup_state SET retry_after = 1 WHERE lookup_key = ?').run(
            lookupKey,
        );
        db.close();

        const calls = installProviderStub({ geniusHits: [geniusHit] });
        const result = await resolver.resolveLyrics(request);

        assert.equal(result.outcome, 'found');
        assert.ok(
            calls.some((url) => url.includes('/invoke/genius/method/search')),
            'an expired gate lets the lookup run again',
        );
        assert.equal((await readRawRow(lookupKey))?.lyrics_url, '/artist-one-song-one-lyrics');
    });

    it('keeps a Genius failure retryable with no gate', async () => {
        const { repo, resolver } = await loadModules();
        installProviderStub({ geniusStatus: 503, recordingStatus: 200, recordingRelations: [] });

        const result = await resolver.resolveLyrics(request);
        assert.equal(result.outcome, 'failure');
        assert.equal(result.url, undefined);

        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        const row = await readRawRow(lookupKey);
        assert.equal(row?.lyrics_url, null);
        assert.equal(row?.retry_after, null, 'a failure is retried on the next request');
    });

    it('treats a Genius miss as final when no recording identity exists', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({ geniusHits: [] });
        const noRecording = { ...request, recordingId: null };

        const result = await resolver.resolveLyrics(noRecording);

        assert.equal(result.outcome, 'confirmed-miss');
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/')).length,
            0,
            'the fallback may never search the catalogue',
        );
        const lookupKey = repo.buildDurableLyricsLookupIdentity(noRecording).lookupKey;
        assert.ok((await readRawRow(lookupKey))?.retry_after);
    });

    it('keeps a budget-starved fallback retryable', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({ geniusHits: [], recordingRelations: [] });

        const result = await resolver.resolveLyrics(request, undefined, {
            canUseMusicBrainzFallback: () => false,
        });

        assert.equal(result.outcome, 'failure');
        assert.equal(
            calls.filter((url) => url.includes('/invoke/musicbrainz/')).length,
            0,
        );
        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        assert.equal((await readRawRow(lookupKey))?.retry_after, null);
    });

    it('writes nothing after cancellation', async () => {
        const { repo, resolver } = await loadModules();
        const calls = installProviderStub({ geniusHits: [geniusHit] });
        const controller = new AbortController();
        controller.abort();

        const result = await resolver.resolveLyrics(request, controller.signal);

        assert.equal(result.outcome, 'failure');
        assert.deepEqual(calls, []);
        const lookupKey = repo.buildDurableLyricsLookupIdentity(request).lookupKey;
        assert.equal(await readRawRow(lookupKey), undefined);
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
        const lookupKey = repo.buildDurableLyricsLookupIdentity(variant).lookupKey;

        assert.equal(await readRawRow(lookupKey), undefined);
    });

    it('follows a local recording MBID redirect without deleting the old row', async () => {
        const { repo, resolver } = await loadModules();
        const mirror = await import('../src/infrastructure/musicDb/musicDbClient.js');
        const { createMusicDbFixture } = await import('./helpers/musicDbFixture.js');

        const mirrorPath = createMusicDbFixture();
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
            repo.recordLyricsUrl(request, 'https://genius.com/redirected');
            const calls = installProviderStub({});

            const result = await resolver.resolveLyrics({
                ...request,
                recordingId: 'old-recording',
            });

            assert.equal(result.url, 'https://genius.com/redirected');
            assert.deepEqual(calls, []);
        } finally {
            mirror.closeMusicDb();
            if (previousPath === undefined) delete process.env.MUSIC_DB_PATH;
            else process.env.MUSIC_DB_PATH = previousPath;
            fs.rmSync(mirrorPath, { force: true });
        }
    });
});