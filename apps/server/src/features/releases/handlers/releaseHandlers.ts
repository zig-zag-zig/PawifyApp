import { NotFoundError } from '../../../common/http/errors.js';
import { authenticatedHandler } from '../../../infrastructure/http/authenticatedHandler.js';
import {
    optionalString,
    requireString,
    requireStringArray,
} from '../../../common/http/validation.js';
import type { ReleaseUseCases } from '../releaseUseCases.js';

export type ReleaseWirePresenters = {
    getNewReleases: (result: Awaited<ReturnType<ReleaseUseCases['getNewReleases']>>) => unknown;
    getArtistReleases: (
        result: Awaited<ReturnType<ReleaseUseCases['getArtistReleases']>>,
    ) => unknown;
    getReleaseGroupReleases: (
        result: Awaited<ReturnType<ReleaseUseCases['getReleaseGroupReleases']>>,
    ) => unknown;
    getRelease: (
        result: NonNullable<Awaited<ReturnType<ReleaseUseCases['getRelease']>>>,
    ) => unknown;
};

/** v1 exact old contract: task ids always present, no immediate maps. */
export const releasePresentersV1: ReleaseWirePresenters = {
    getNewReleases: (result) => ({
        releases: result.releases,
        releaseCoverTaskId: result.releaseCoverTaskId,
    }),
    getArtistReleases: (result) => ({
        releaseGroups: result.releaseGroups,
        releaseGroupCoverTaskId: result.releaseGroupCoverTaskId,
    }),
    getReleaseGroupReleases: (result) => ({
        releases: result.releases,
        releaseCoverTaskId: result.releaseCoverTaskId,
    }),
    getRelease: (result) => ({
        release: result.release,
        lyricsTaskId: result.lyricsTaskId,
        profileImageTaskId: result.profileImageTaskId,
    }),
};

/** v2: full cache-first response with immediate maps and nullable task ids. */
export const releasePresentersV2: ReleaseWirePresenters = {
    getNewReleases: (result) => result,
    getArtistReleases: (result) => result,
    getReleaseGroupReleases: (result) => result,
    getRelease: (result) => result,
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

            res.status(200).send(
                presenters.getArtistReleases(
                    await releaseUseCases.getArtistReleases(userId, artistId),
                ),
            );
        },
    );

    const getReleaseGroupReleasesHandler = authenticatedHandler(
        '/getReleaseGroupReleases',
        async ({ req, res, userId }) => {
            const releaseGroupId = requireString(req.body, 'releaseGroupId');

            res.status(200).send(
                presenters.getReleaseGroupReleases(
                    await releaseUseCases.getReleaseGroupReleases(userId, releaseGroupId),
                ),
            );
        },
    );

    const getReleaseHandler = authenticatedHandler('/getRelease', async ({ req, res, userId }) => {
        const releaseId = requireString(req.body, 'releaseId');
        const payload = await releaseUseCases.getRelease(userId, releaseId);

        if (!payload) {
            throw new NotFoundError('Release was not found in MusicBrainz');
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

    return {
        getNewReleasesHandler,
        removeNewReleasesHandler,
        getArtistReleasesHandler,
        getReleaseGroupReleasesHandler,
        getReleaseHandler,
        verifyReleaseExistenceHandler,
    };
};
