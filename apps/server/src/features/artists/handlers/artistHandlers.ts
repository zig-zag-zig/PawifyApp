import { authenticatedHandler } from '../../../infrastructure/http/authenticatedHandler.js';
import {
    optionalIntegerInRange,
    optionalNonNegativeInteger,
    optionalString,
    requireString,
    requireStringArray,
} from '../../../common/http/validation.js';
import { NotFoundError } from '../../../common/http/errors.js';
import type { ArtistUseCases } from '../artistUseCases.js';

export type ArtistWirePresenters = {
    getFollowing: (result: Awaited<ReturnType<ArtistUseCases['getFollowing']>>) => unknown;
    getArtistDetails: (
        result: NonNullable<Awaited<ReturnType<ArtistUseCases['getArtistDetails']>>>,
    ) => unknown;
    searchArtists: (result: Awaited<ReturnType<ArtistUseCases['searchArtists']>>) => unknown;
};

/** v1 exact old contract: task ids always present, no immediate maps. */
export const artistPresentersV1: ArtistWirePresenters = {
    getFollowing: (result) => ({
        artists: result.artists,
        profileImageTaskId: result.profileImageTaskId,
    }),
    getArtistDetails: (result) => ({
        artist: result.artist,
        profileImageTaskId: result.profileImageTaskId,
    }),
    searchArtists: (result) => ({
        artists: result.artists,
        count: result.count,
        profileImageTaskId: result.profileImageTaskId,
    }),
};

/** v2: full cache-first response with immediate maps and nullable task ids. */
export const artistPresentersV2: ArtistWirePresenters = {
    getFollowing: (result) => result,
    getArtistDetails: (result) => result,
    searchArtists: (result) => result,
};

export const createArtistHandlers = (
    artistUseCases: ArtistUseCases,
    presenters: ArtistWirePresenters,
) => {
    const getFollowingHandler = authenticatedHandler('/getFollowing', async ({ res, userId }) => {
        res.status(200).send(presenters.getFollowing(await artistUseCases.getFollowing(userId)));
    });

    const getArtistDetailsHandler = authenticatedHandler(
        '/getArtistDetails',
        async ({ req, res, userId }) => {
            const artistId = requireString(req.body, 'artistId');
            const payload = await artistUseCases.getArtistDetails(userId, artistId);

            if (!payload) {
                throw new NotFoundError('Artist was not found in MusicBrainz');
            }

            res.status(200).send(presenters.getArtistDetails(payload));
        },
    );

    const searchArtistsHandler = authenticatedHandler(
        '/searchArtists',
        async ({ req, res, userId }) => {
            const query = requireString(req.body, 'query');
            const limit = optionalIntegerInRange(req.body, 'limit', 25, 1, 100);
            const offset = optionalNonNegativeInteger(req.body, 'offset', 0);

            res.status(200).send(
                presenters.searchArtists(
                    await artistUseCases.searchArtists(userId, query, offset, limit),
                ),
            );
        },
    );

    const followArtistHandler = authenticatedHandler(
        '/followArtist',
        async ({ req, res, userId }) => {
            const artistId = requireString(req.body, 'artistId');
            const sourcePushToken = optionalString(req.body, 'sourcePushToken');

            await artistUseCases.followArtist(userId, artistId, sourcePushToken);
            res.status(200).send('Artist and releases saved successfully.');
        },
    );

    const unfollowArtistHandler = authenticatedHandler(
        '/unfollowArtist',
        async ({ req, res, userId }) => {
            const artistId = requireString(req.body, 'artistId');
            const sourcePushToken = optionalString(req.body, 'sourcePushToken');

            await artistUseCases.unfollowArtists(userId, [artistId], sourcePushToken);
            res.status(200).send(`Artist ${artistId} and their releases deleted successfully.`);
        },
    );

    const unfollowArtistsHandler = authenticatedHandler(
        '/unfollowArtists',
        async ({ req, res, userId }) => {
            const artistIds = requireStringArray(req.body, 'artistIds', 500);
            const sourcePushToken = optionalString(req.body, 'sourcePushToken');

            await artistUseCases.unfollowArtists(userId, artistIds, sourcePushToken);
            res.status(200).send(`Successfully unfollowed ${artistIds.length} artists.`);
        },
    );

    return {
        getFollowingHandler,
        getArtistDetailsHandler,
        searchArtistsHandler,
        followArtistHandler,
        unfollowArtistHandler,
        unfollowArtistsHandler,
    };
};
