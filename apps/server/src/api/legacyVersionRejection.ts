import express from 'express';

const UNSUPPORTED_API_VERSIONS = ['/v1', '/v2'];

/**
 * Old API versions are rejected, not emulated.
 *
 * This is intentionally not a compatibility shim: clients must upgrade to v3, and
 * the response says so instead of silently serving a different contract.
 */
export const rejectUnsupportedApiVersions = (): express.Router => {
    const router = express.Router();

    for (const prefix of UNSUPPORTED_API_VERSIONS) {
        router.use(prefix, (_req, res) => {
            res.status(410).json({
                code: 'API_VERSION_UNSUPPORTED',
                message: `API version ${prefix.slice(1)} is no longer supported. Upgrade the app to use /v3.`,
                statusCode: 410,
            });
        });
    }

    return router;
};
