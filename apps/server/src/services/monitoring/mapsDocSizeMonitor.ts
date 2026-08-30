import { createLogger } from '../../common/logging/logger.js';
import { getFollowingMapDocRef, getNewReleasesMapDocRef } from '../firebase/refs.js';
import { checkMapsDocSizeThresholds } from './mapsDocSizeThresholds.js';

// Re-export for backward-compatible imports and unit testing.
export { checkMapsDocSizeThresholds };

const logger = createLogger('services.monitoring.mapsDocSize');

export const monitorUserMapsDocSizes = async (userId: string): Promise<void> => {
    const followingRef = getFollowingMapDocRef(userId);
    const newReleasesRef = getNewReleasesMapDocRef(userId);

    const [followingSnap, newReleasesSnap] = await Promise.all([
        followingRef.get(),
        newReleasesRef.get(),
    ]);

    if (followingSnap.exists) {
        const size = Buffer.byteLength(JSON.stringify(followingSnap.data()), 'utf8');
        const level = checkMapsDocSizeThresholds(size);
        if (level === 'warn') {
            logger.warn('maps doc size approaching limit', {
                userId,
                collection: 'followingArtists/maps',
                sizeBytes: size,
                threshold: 'warn',
            });
        } else if (level === 'critical') {
            logger.error('maps doc size near critical limit', {
                userId,
                collection: 'followingArtists/maps',
                sizeBytes: size,
                threshold: 'critical',
            });
        }
    }

    if (newReleasesSnap.exists) {
        const size = Buffer.byteLength(JSON.stringify(newReleasesSnap.data()), 'utf8');
        const level = checkMapsDocSizeThresholds(size);
        if (level === 'warn') {
            logger.warn('maps doc size approaching limit', {
                userId,
                collection: 'newReleases/maps',
                sizeBytes: size,
                threshold: 'warn',
            });
        } else if (level === 'critical') {
            logger.error('maps doc size near critical limit', {
                userId,
                collection: 'newReleases/maps',
                sizeBytes: size,
                threshold: 'critical',
            });
        }
    }
};
