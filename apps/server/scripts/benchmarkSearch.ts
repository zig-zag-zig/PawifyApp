/**
 * Read-only search timing probe against the required local mirror.
 *
 *   npx tsx scripts/benchmarkSearch.ts
 *
 * Not a production proof: run it on the host that serves traffic and repeat each
 * query several times. It reports the work the server actually performs, so a
 * worker-thread pool is only introduced when these measurements show independent
 * categories stalling each other.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { getMusicDb } from '../src/infrastructure/musicDb/musicDbClient.js';
import { readRecordingSearch } from '../src/infrastructure/musicDb/recordingQueries.js';
import {
    searchArtistsFromMirror,
    searchReleaseGroupsFromMirror,
} from '../src/infrastructure/musicDb/musicDbRepositories.js';

const QUERIES = ['a', 'the', 'lloyd banks', 'porcupine tree', 'zzzzzzzz not a band'];

const time = <T>(label: string, worker: () => T): void => {
    const lag = monitorEventLoopDelay({ resolution: 1 });
    lag.enable();
    const startedAt = process.hrtime.bigint();
    const result = worker();
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    lag.disable();
    console.log(
        JSON.stringify({
            label,
            elapsedMs: Math.round(elapsedMs * 100) / 100,
            eventLoopP99Ms: Math.round((lag.percentile(99) / 1e6) * 100) / 100,
            eventLoopMaxMs: Math.round((lag.max / 1e6) * 100) / 100,
            result: result as unknown,
        }),
    );
};

const main = (): void => {
    getMusicDb();
    for (const query of QUERIES) {
        time(`artists:${query}`, () => searchArtistsFromMirror(query, 0, 25).count);
        time(`groups:${query}`, () => searchReleaseGroupsFromMirror(query, 0, 25).count);
        time(`recordings:${query}`, () => readRecordingSearch(getMusicDb(), query, 0, 25).count);
    }
};

main();
