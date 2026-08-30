import { createLogger } from '../../common/logging/logger.js';
import { musicApiConfig } from '../../config/runtimeConfig.js';
import { getDaprSecret } from '../../infrastructure/dapr/daprSecrets.js';

const loggedMissingOptionalCredentials = new Set<string>();
const logger = createLogger('services.musicApi');

export const getMusicBrainzUserAgent = () => musicApiConfig.musicBrainzUserAgent;
export const getGeniusAccessToken = async () => await getDaprSecret('genius-access-token');
export const getDiscogsToken = async () => await getDaprSecret('discogs-token');

export const logMissingOptionalCredentialOnce = (name: string): void => {
    if (loggedMissingOptionalCredentials.has(name)) {
        return;
    }

    loggedMissingOptionalCredentials.add(name);
    logger.warn('optional provider credential missing', { credential: name });
};
