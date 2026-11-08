import express from 'express';
import { authenticatedHandler } from '../../infrastructure/http/authenticatedHandler.js';
import { requireString } from '../../common/http/validation.js';
import { BadRequestError } from '../../common/http/errors.js';
import { invalidateEntityImage } from '../../services/artwork/invalidateEntityImage.js';
import type { EntityImageEntityType } from '../../infrastructure/musicDb/entityImageRepository.js';

const ENTITY_TYPES: ReadonlySet<string> = new Set<EntityImageEntityType>([
    'artist',
    'release',
    'release_group',
]);

/**
 * Reports an artwork URL that no longer loads so the server can re-resolve it.
 *
 * The client only says "this tile failed"; the server decides whether the CDN
 * actually deleted the file before touching the mirror.
 */
export const artworkRoutes = express.Router();

artworkRoutes.post(
    '/invalidateEntityImage',
    authenticatedHandler('/invalidateEntityImage', async ({ req, res }) => {
        const entityType = requireString(req.body, 'entityType');
        const entityId = requireString(req.body, 'entityId');

        if (!ENTITY_TYPES.has(entityType)) {
            throw new BadRequestError(
                'The entityType property must be one of artist, release or release_group',
            );
        }

        const result = await invalidateEntityImage(entityType as EntityImageEntityType, entityId);

        res.status(200).send(result);
    }),
);
