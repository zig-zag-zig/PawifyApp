import React from 'react';
import ReleaseGroupView from '../components/ReleaseGroupView';
import { useReleaseGroupPage } from '../hooks/useReleaseGroupPage';

const ReleaseGroupPage = () => {
    const releaseGroupPage = useReleaseGroupPage();

    return (
        <ReleaseGroupView
            releaseGroupTitle={releaseGroupPage.state.releaseGroupTitle}
            releases={releaseGroupPage.state.releases}
            releaseCount={releaseGroupPage.state.releaseCount}
            releaseGroupReleaseCovers={releaseGroupPage.state.releaseGroupReleaseCovers}
            pendingReleaseCoverIds={releaseGroupPage.state.pendingReleaseCoverIds}
            isLoadingReleases={releaseGroupPage.state.isLoadingReleases}
            releaseLoadFailed={releaseGroupPage.state.releaseLoadFailed}
            releaseGroupNotFound={releaseGroupPage.state.releaseGroupNotFound}
            releaseGroupId={releaseGroupPage.state.releaseGroupId}
            onReleasePressed={releaseGroupPage.onReleasePressed}
            onRetryLoadReleases={releaseGroupPage.onRetryLoadReleases}
        />
    );
};

export default ReleaseGroupPage;
