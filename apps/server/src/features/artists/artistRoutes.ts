import express from 'express';
import { createArtistHandlers, type ArtistWirePresenters } from './handlers/artistHandlers.js';
import type { ArtistUseCases } from './artistUseCases.js';

export const createArtistRoutes = (
    artistUseCases: ArtistUseCases,
    presenters: ArtistWirePresenters,
): express.Router => {
    const router = express.Router();
    const handlers = createArtistHandlers(artistUseCases, presenters);

    router.get('/getFollowing', handlers.getFollowingHandler);
    router.post('/getArtistDetails', handlers.getArtistDetailsHandler);
    router.post('/searchArtists', handlers.searchArtistsHandler);
    router.post('/followArtist', handlers.followArtistHandler);
    router.post('/unfollowArtist', handlers.unfollowArtistHandler);
    router.post('/unfollowArtists', handlers.unfollowArtistsHandler);

    return router;
};
