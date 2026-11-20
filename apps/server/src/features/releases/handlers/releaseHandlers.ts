import { NotFoundError } from '../../../common/http/errors.js';
import { authenticatedHandler } from '../../../infrastructure/http/authenticatedHandler.js';
import {
    optionalIntegerInRange,
    optionalString,
    requireString,
    requireStringArray,
} from '../../../common/http/validation.js';
import type { ReleaseUseCases } from '../releaseUseCases.js';

const DEFAULT_ARTIST_RELEASES_PAGE_SIZE = 60;
const MAX_ARTIST_RELEASES_PAGE_SIZE = 200;

export type ReleaseWirePresenters = {
    getNewReleases: (result: Awaited<ReturnType<ReleaseUseCases['getNewReleases']>>) => unknown;
    getReleaseGroupReleases: (
        result: NonNullable<Awaited<ReturnType<ReleaseUseCases['getReleaseGroupReleases']>>>,
    ) => unknown;
    getRelease: (
        result: NonNullable<Awaited<ReturnType<ReleaseUseCases['getRelease']>>>,
    ) => unknown;
    resolveNewReleaseCovers: (
        result: Awaited<ReturnType<ReleaseUseCases['resolveNewReleaseCovers']>>,
    ) => unknown;
};

/** Single v3 wire contract: cache-first payloads with nullable task ids. */
export const releasePresentersV3: ReleaseWirePresenters = {
    getNewReleases: (result) => result,
    getReleaseGroupReleases: (result) => result,
    getRelease: (result) => result,
    resolveNewReleaseCovers: (result) => result,
};

export const createReleaseHandlers = (
    releaseUseCases: ReleaseUseCases,
    presenters: ReleaseWirePresenters,
) => {
    const getNewReleasesHandler = authenticatedHandler(
        '/getNewReleases',
        async ({ res, userId }) => {
            res.status(200).send(
                presenters.getNewReleases(await releaseUseCases.getNewReleases(userId)),
            );
        },
    );

    const removeNewReleasesHandler = authenticatedHandler(
        '/removeNewReleases',
        async ({ req, res, userId }) => {
            const releaseIds = requireStringArray(req.body, 'releaseIds', 500);
            const sourcePushToken = optionalString(req.body, 'sourcePushToken');

            await releaseUseCases.removeNewReleases(userId, releaseIds, sourcePushToken);
            res.status(200).send(`Successfully removed ${releaseIds.length} new releases.`);
        },
    );

    const getArtistReleasesHandler = authenticatedHandler(
        '/getArtistReleases',
        async ({ req, res, userId }) => {
            const artistId = requireString(req.body, 'artistId');
            const limit = optionalIntegerInRange(
                req.body,
                'limit',
                DEFAULT_ARTIST_RELEASES_PAGE_SIZE,
                1,
                MAX_ARTIST_RELEASES_PAGE_SIZE,
            );
            const cursor = optionalString(req.body, 'cursor') ?? null;

            res.status(200).send(
                await releaseUseCases.getArtistReleasesPage(userId, artistId, { limit, cursor }),
            );
        },
    );

    const getReleaseGroupReleasesHandler = authenticatedHandler(
        '/getReleaseGroupReleases',
        async ({ req, res, userId }) => {
            const releaseGroupId = requireString(req.body, 'releaseGroupId');
            const payload = await releaseUseCases.getReleaseGroupReleases(userId, releaseGroupId);

            if (!payload) {
                throw new NotFoundError('Release group was not found in the local catalogue');
            }

            res.status(200).send(presenters.getReleaseGroupReleases(payload));
        },
    );

    const getReleaseHandler = authenticatedHandler('/getRelease', async ({ req, res, userId }) => {
        const releaseId = requireString(req.body, 'releaseId');
        const payload = await releaseUseCases.getRelease(userId, releaseId);

        if (!payload) {
            throw new NotFoundError('Release was not found in the local catalogue');
        }

        res.status(200).send(presenters.getRelease(payload));
    });

    const verifyReleaseExistenceHandler = authenticatedHandler(
        '/verifyReleaseExistence',
        async ({ req, res, userId }) => {
            const releaseId = requireString(req.body, 'releaseId');

            res.status(200).send(await releaseUseCases.verifyReleaseExistence(userId, releaseId));
        },
    );

    const resolveReleaseGroupReleaseCoversHandler = authenticatedHandler(
        '/resolveReleaseGroupReleaseCovers',
        async ({ req, res, userId }) => {
            const releaseGroupId = requireString(req.body, 'releaseGroupId');
            const releaseIds = requireStringArray(req.body, 'releaseIds', 200);

            res.status(200).send(
                await releaseUseCases.resolveReleaseGroupReleaseCovers(
                    userId,
                    releaseGroupId,
                    releaseIds,
                ),
            );
        },
    );

    const resolveNewReleaseCoversHandler = authenticatedHandler(
        '/resolveNewReleaseCovers',
        async ({ req, res, userId }) => {
            // One screen page at a time, capped so a client cannot queue the feed.
            const releaseIds = requireStringArray(req.body, 'releaseIds', 100);

            res.status(200).send(
                presenters.resolveNewReleaseCovers(
                    await releaseUseCases.resolveNewReleaseCovers(userId, releaseIds),
                ),
            );
        },
    );

    return {
        resolveReleaseGroupReleaseCoversHandler,
        resolveNewReleaseCoversHandler,
        getNewReleasesHandler,
        removeNewReleasesHandler,
        getArtistReleasesHandler,
        getReleaseGroupReleasesHandler,
        getReleaseHandler,
        verifyReleaseExistenceHandler,
    };
};
