import React from 'react';
import type { ReleaseGroupReleaseListItem } from '../../../modules/models/models';
import ReleaseGroupCard from './ReleaseGroupCard';

interface ReleaseGroupViewProps {
    releases: ReleaseGroupReleaseListItem[];
    releaseGroupReleaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    onReleasePressed: (release: ReleaseGroupReleaseListItem) => void;
}

const ReleaseGroupView = ({
    releases,
    releaseGroupReleaseCovers,
    pendingReleaseCoverIds,
    onReleasePressed
}: ReleaseGroupViewProps) => {
    return (
        <ReleaseGroupCard
            releases={releases}
            releaseCovers={releaseGroupReleaseCovers}
            pendingReleaseCoverIds={pendingReleaseCoverIds}
            onPress={onReleasePressed}
        />
    );
};

export default ReleaseGroupView;
