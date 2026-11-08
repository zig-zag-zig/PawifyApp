import { getReleaseCover, getReleaseGroupCover } from '../../coverArtService.js';
import { writeReleaseCoverState } from '../../coverArt/coverArtCache.js';
import { musicDbHasEntityImages } from '../../../infrastructure/musicDb/musicDbClient.js';
import { aggregateProviderUrls, getReleaseProviderUrls } from '../../coverArt/coverArtLookup.js';
import { getReleaseIdsForGroupFromMirror } from '../../../infrastructure/musicDb/musicDbRepositories.js';
import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import { dedupeStrings } from '../../../common/utils/array.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import type {
    ReleaseGroupCoverTaskResult,
    ReleaseGroupPageEntry,
    ReleaseGroupReleaseCoverTaskResult,
    ReleaseGroupReleasesPageEntry,
} from '../../../utils/types/taskTypes.js';

const logger = createLogger('services.backgroundTasks.coverArt');

const COVER_ART_REQUEST_CONCURRENCY = backgroundTaskWorkerConfig.coverArtRequestConcurrency;

export const fetchAndUpsertReleaseGroupReleaseCovers = async (
    releaseGroupId: string,
    releaseIds: string[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<ReleaseGroupReleaseCoverTaskResult> => {
    const uniqueReleaseIds = dedupeStrings(releaseIds);
    const startedAt = Date.now();
    const resultMap: { [releaseId: string]: string | null | undefined } = {};

    logger.debug('release cover batch started', {
        releaseGroupId,
        releaseCount: uniqueReleaseIds.length,
        ttlHours: ttl ?? null,
    });

    // One SQLite read for the whole page instead of one per release.
    const providerUrlsByRelease = getReleaseProviderUrls(uniqueReleaseIds);

    await mapWithConcurrency(uniqueReleaseIds, COVER_ART_REQUEST_CONCURRENCY, async (releaseId) => {
        const cover = await getReleaseCover(
            releaseId,
            releaseGroupId,
            ttl,
            signal,
            providerUrlsByRelease.get(releaseId),
        );
        resultMap[releaseId] = cover.state.url;
    });

    logger.debug('release cover batch completed', {
        releaseGroupId,
        releaseCount: uniqueReleaseIds.length,
        durationMs: Date.now() - startedAt,
    });

    return {
        releaseGroupId,
        covers: resultMap,
    };
};

/**
 * New-release feed covers.
 *
 * The feed is one entry per release *group* (the representative release id is only
 * there to open the release screen), so it resolves exactly like the artist screen:
 * one group cover per entry. It previously called the release-cover worker once per
 * release, which asked Cover Art Archive for `/release/<id>/front` — a much slower
 * and less reliable endpoint than the group one, and repeated per pressing.
 *
 * The result is keyed by release id because that is what the client asks for when it
 * wants "covers for these feed rows".
 */
export const fetchAndUpsertNewReleaseGroupCovers = async (
    pageEntries: ReleaseGroupReleasesPageEntry[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<{ covers: { [releaseId: string]: string | null | undefined } }> => {
    const covers: { [releaseId: string]: string | null | undefined } = {};
    const startedAt = Date.now();
    let firstError: unknown;

    // Entries written before new-release detection switched to release groups carry
    // no `releaseGroupId`. Skipping them (the old behaviour) left them with no cover
    // plan at all, so the placeholder never cleared no matter how often the feed was
    // reloaded. They are resolved one release at a time instead.
    const groupEntries: Array<{ releaseGroupId: string; releaseIds: string[] }> = [];
    const standaloneReleaseIds: string[] = [];
    for (const entry of pageEntries) {
        if (entry.releaseGroupId) {
            groupEntries.push({
                releaseGroupId: entry.releaseGroupId,
                releaseIds: dedupeStrings(entry.releaseIds),
            });
        } else {
            standaloneReleaseIds.push(...entry.releaseIds);
        }
    }

    // Deduped up front so the batch mirror query below covers every release the
    // task will resolve, including the group-less legacy feed rows. Looking them up
    // one release at a time here would run one SQLite query per standalone row.
    const uniqueStandaloneReleaseIds = dedupeStrings(standaloneReleaseIds);

    const providerUrlsByRelease = getReleaseProviderUrls([
        ...groupEntries.flatMap((entry) => entry.releaseIds),
        ...uniqueStandaloneReleaseIds,
    ]);

    logger.debug('new release cover batch started', {
        releaseGroupCount: groupEntries.length,
        standaloneReleaseCount: uniqueStandaloneReleaseIds.length,
        releaseCount: groupEntries.reduce((total, entry) => total + entry.releaseIds.length, 0),
        ttlHours: ttl ?? null,
    });

    await mapWithConcurrency(groupEntries, COVER_ART_REQUEST_CONCURRENCY, async (entry) => {
        const releaseIds = entry.releaseIds;

        try {
            const cover = await getReleaseGroupCover(
                undefined,
                entry.releaseGroupId,
                releaseIds,
                ttl,
                signal,
                undefined,
                aggregateProviderUrls(
                    new Map(
                        releaseIds.flatMap((releaseId) => {
                            const urls = providerUrlsByRelease.get(releaseId);
                            return urls ? [[releaseId, urls] as const] : [];
                        }),
                    ),
                ),
            );

            // Every release in the group shares the group cover, and each one is
            // written to its own cache key: the New Releases page peeks per-release
            // states (`partitionReleaseGroupReleaseCovers`), so leaving them unwritten
            // made every page load re-queue the same groups forever.
            for (const releaseId of releaseIds) {
                covers[releaseId] = cover.state.url;
                if (musicDbHasEntityImages()) {
                    // One source of truth: the mirror already stores this group's
                    // cover, so per-release rows stay untouched and the server reads
                    // the group row as the fallback.
                    continue;
                }
                await writeReleaseCoverState(releaseId, cover.state, ttl);
            }
        } catch (error) {
            if (!firstError) {
                firstError = error;
            }
        }
    });

    await mapWithConcurrency(
        uniqueStandaloneReleaseIds,
        COVER_ART_REQUEST_CONCURRENCY,
        async (releaseId) => {
            try {
                const cover = await getReleaseCover(
                    releaseId,
                    null,
                    ttl,
                    signal,
                    providerUrlsByRelease.get(releaseId),
                );
                covers[releaseId] = cover.state.url;
            } catch (error) {
                if (!firstError) {
                    firstError = error;
                }
            }
        },
    );

    if (firstError) {
        logger.warn('new release cover batch completed with errors', {
            releaseGroupCount: pageEntries.length,
            durationMs: Date.now() - startedAt,
        });
        throw firstError;
    }

    logger.debug('new release cover batch completed', {
        releaseGroupCount: pageEntries.length,
        durationMs: Date.now() - startedAt,
    });

    return { covers };
};

export const fetchAndUpsertArtistReleaseGroupCovers = async (
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<ReleaseGroupCoverTaskResult> => {
    const resultMap: { [releaseGroupId: string]: string | null | undefined } = {};
    const startedAt = Date.now();
    let firstError: unknown;

    // Search pages carry group ids but no release ids. The artist page carries the
    // ids, which is why it was fast: it could use Deezer/Tidal before CAA. Previously
    // an empty entry produced an empty provider-url aggregate and silently forced
    // search straight to CAA for every group. Fill those ids from the mirror once for
    // the page, exactly as the artist path does.
    const releaseIdsByGroup = new Map<string, string[]>(
        pageEntries.map((entry) => [
            entry.releaseGroupId,
            entry.releaseIds.length > 0
                ? entry.releaseIds
                : getReleaseIdsForGroupFromMirror(entry.releaseGroupId),
        ]),
    );
    const providerUrlsByRelease = getReleaseProviderUrls(
        Array.from(releaseIdsByGroup.values()).flat(),
    );

    logger.debug('release-group cover batch started', {
        artistId,
        releaseGroupCount: pageEntries.length,
        ttlHours: ttl ?? null,
    });

    await mapWithConcurrency(pageEntries, COVER_ART_REQUEST_CONCURRENCY, async (entry) => {
        try {
            const cover = await getReleaseGroupCover(
                artistId,
                entry.releaseGroupId,
                entry.releaseIds,
                ttl,
                signal,
                undefined,
                aggregateProviderUrls(
                    new Map(
                        (releaseIdsByGroup.get(entry.releaseGroupId) ?? []).flatMap((releaseId) => {
                            const urls = providerUrlsByRelease.get(releaseId);
                            return urls ? [[releaseId, urls] as const] : [];
                        }),
                    ),
                ),
            );
            resultMap[entry.releaseGroupId] = cover.state.url;
        } catch (error) {
            if (!firstError) {
                firstError = error;
            }
        }
    });

    if (firstError) {
        logger.warn('release-group cover batch completed with errors', {
            artistId,
            releaseGroupCount: pageEntries.length,
            durationMs: Date.now() - startedAt,
        });
        throw firstError;
    }

    logger.debug('release-group cover batch completed', {
        artistId,
        releaseGroupCount: pageEntries.length,
        durationMs: Date.now() - startedAt,
    });

    return {
        artistId,
        covers: resultMap,
    };
};
