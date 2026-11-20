import React from 'react';
import type { ReleaseGroupReleaseListItem } from '@pawify/shared';
import ReleaseGroupCard from './ReleaseGroupCard';

interface ReleaseGroupViewProps {
    releaseGroupTitle: string | null;
    releases: ReleaseGroupReleaseListItem[];
    releaseCount: number;
    releaseGroupReleaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    isLoadingReleases: boolean;
    releaseLoadFailed: boolean;
    releaseGroupNotFound: boolean;
    releaseGroupId: string | null;
    onReleasePressed: (release: ReleaseGroupReleaseListItem) => void;
    onRetryLoadReleases: () => void;
}

const ReleaseGroupView = ({
    releaseGroupTitle,
    releases,
    releaseCount,
    releaseGroupReleaseCovers,
    pendingReleaseCoverIds,
    isLoadingReleases,
    releaseLoadFailed,
    releaseGroupNotFound,
    releaseGroupId,
    onReleasePressed,
    onRetryLoadReleases,
}: ReleaseGroupViewProps) => (
    <ReleaseGroupCard
        releaseGroupTitle={releaseGroupTitle}
        releases={releases}
        releaseCount={releaseCount}
        releaseCovers={releaseGroupReleaseCovers}
        pendingReleaseCoverIds={pendingReleaseCoverIds}
        releaseGroupId={releaseGroupId}
        isLoadingReleases={isLoadingReleases}
        releaseLoadFailed={releaseLoadFailed}
        releaseGroupNotFound={releaseGroupNotFound}
        onPress={onReleasePressed}
        onRetryLoadReleases={onRetryLoadReleases}
        onContentReady={() => undefined}
    />
);

export default ReleaseGroupView;
