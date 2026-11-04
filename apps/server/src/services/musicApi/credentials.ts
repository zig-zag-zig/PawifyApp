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
 * Resolves the Tidal API token. Precedence: Dapr secret, then an explicit
 * TIDAL_API_TOKEN override.
 *
 * Returns undefined when neither is configured. There is deliberately no
 * built-in token: a shared public credential quietly carrying production
 * traffic hides an unconfigured deployment, and it can be revoked by Tidal at
 * any time (HTTP 401, subStatus 6004). Callers skip Tidal instead.
 */
export const getTidalToken = async (): Promise<string | undefined> =>
    (await getDaprSecret('tidal-token')) ?? musicApiConfig.tidalApiToken;

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
