import { createLogger } from '../../common/logging/logger.js';
import { musicApiConfig } from '../../config/runtimeConfig.js';
import { getDaprSecret } from '../../infrastructure/dapr/daprSecrets.js';

const loggedMissingOptionalCredentials = new Set<string>();
const loggedTidalTokenRejections = new Set<number>();
const logger = createLogger('services.musicApi');

export const getMusicBrainzUserAgent = () => musicApiConfig.musicBrainzUserAgent;
export const getGeniusAccessToken = async () => await getDaprSecret('genius-access-token');
export const getDiscogsToken = async () => await getDaprSecret('discogs-token');

/**
 * Widely-used public Tidal client token. It is not a per-user credential and can
 * be revoked or rotated by Tidal at any time, which surfaces as HTTP 401
 * (subStatus 6004 "Invalid token"). Kept as a last-resort default so the Tidal
 * fallback works in a fresh checkout with no secrets configured.
 */
const TIDAL_COMMUNITY_TOKEN = 'gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe';

/**
 * Resolves the Tidal API token. Precedence: Dapr secret, then TIDAL_API_TOKEN,
 * then the built-in community token. Always returns a usable value, so callers
 * never need a missing-credential branch.
 */
export const getTidalToken = async (): Promise<string> =>
    (await getDaprSecret('tidal-token')) ?? musicApiConfig.tidalApiToken ?? TIDAL_COMMUNITY_TOKEN;

export const getTidalCountryCode = (): string => musicApiConfig.tidalCountryCode;

/**
 * Reports a rejected Tidal token once per process per status.
 *
 * A revoked community token affects every Tidal-linked artist, so logging it per
 * lookup would bury the signal under hundreds of identical lines. One warning
 * plus the zeroed `tidalImageFoundCount` in the artist-image batch summary is
 * enough to spot it.
 */
export const logTidalTokenRejectedOnce = (status: number): void => {
    if (loggedTidalTokenRejections.has(status)) {
        return;
    }

    loggedTidalTokenRejections.add(status);
    logger.warn('tidal api token rejected; tidal-linked artists fall back to discogs', {
        credential: 'tidal-token',
        status,
    });
};

export const logMissingOptionalCredentialOnce = (name: string): void => {
    if (loggedMissingOptionalCredentials.has(name)) {
        return;
    }

    loggedMissingOptionalCredentials.add(name);
    logger.warn('optional provider credential missing', { credential: name });
};
