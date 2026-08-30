import { useEffect, useRef, type RefObject } from 'react';
import {
    describeIds,
    diagnosticLog,
    diagnosticWarn,
} from '../../../utils/diagnostics';

interface UseArtistPageDiagnosticsOptions {
    artistId?: string;
    artistIdRef: RefObject<string | undefined>;
    queuedMemberImageIdsRef: RefObject<Set<string>>;
    pendingArtistImageIds: string[];
    pendingReleaseGroupCoverIds: string[];
    membersWithoutCachedPicture: string[];
}

export const useArtistPageDiagnostics = ({
    artistId,
    artistIdRef,
    queuedMemberImageIdsRef,
    pendingArtistImageIds,
    pendingReleaseGroupCoverIds,
    membersWithoutCachedPicture,
}: UseArtistPageDiagnosticsOptions): void => {
    const lastPendingArtistImageIdsRef = useRef<string[]>([]);
    const lastPendingReleaseGroupCoverIdsRef = useRef<string[]>([]);
    const lastMembersWithoutCachedPictureRef = useRef<string[]>([]);

    useEffect(() => {
        const intervalMs = 1000;
        let expectedAt = Date.now() + intervalMs;

        const intervalRef = setInterval(() => {
            const now = Date.now();
            const driftMs = now - expectedAt;
            if (driftMs > 750) {
                diagnosticWarn('artist-page', 'js-thread-lag', {
                    currentArtistId: artistIdRef.current,
                    driftMs,
                    pendingArtistImageIds: describeIds(lastPendingArtistImageIdsRef.current),
                    pendingReleaseGroupCoverIds: describeIds(lastPendingReleaseGroupCoverIdsRef.current),
                    membersWithoutCachedPicture: describeIds(lastMembersWithoutCachedPictureRef.current),
                    queuedMemberImageCount: queuedMemberImageIdsRef.current.size,
                });
            }
            expectedAt = now + intervalMs;
        }, intervalMs);

        return () => clearInterval(intervalRef);
    }, [artistId, artistIdRef, queuedMemberImageIdsRef]);

    useEffect(() => {
        const previousIds = lastPendingArtistImageIdsRef.current;
        const nextIds = pendingArtistImageIds;
        if (previousIds.join('|') !== nextIds.join('|')) {
            diagnosticLog('artist-page', 'pending-artist-images-state', {
                currentArtistId: artistIdRef.current,
                previous: describeIds(previousIds),
                next: describeIds(nextIds),
            });
            lastPendingArtistImageIdsRef.current = nextIds;
        }
    }, [artistIdRef, pendingArtistImageIds]);

    useEffect(() => {
        const previousIds = lastPendingReleaseGroupCoverIdsRef.current;
        const nextIds = pendingReleaseGroupCoverIds;
        if (previousIds.join('|') !== nextIds.join('|')) {
            diagnosticLog('artist-page', 'pending-release-group-covers-state', {
                currentArtistId: artistIdRef.current,
                previous: describeIds(previousIds),
                next: describeIds(nextIds),
            });
            lastPendingReleaseGroupCoverIdsRef.current = nextIds;
        }
    }, [artistIdRef, pendingReleaseGroupCoverIds]);

    useEffect(() => {
        const previousIds = lastMembersWithoutCachedPictureRef.current;
        const nextIds = membersWithoutCachedPicture;
        if (previousIds.join('|') !== nextIds.join('|')) {
            diagnosticLog('artist-page', 'members-without-picture-state', {
                currentArtistId: artistIdRef.current,
                previous: describeIds(previousIds),
                next: describeIds(nextIds),
            });
            lastMembersWithoutCachedPictureRef.current = nextIds;
        }
    }, [artistIdRef, membersWithoutCachedPicture]);
};
