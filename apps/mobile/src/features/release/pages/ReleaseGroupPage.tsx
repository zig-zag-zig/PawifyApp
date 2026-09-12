import React from 'react';
import ReleaseGroupView from '../components/ReleaseGroupView';
import { useReleaseGroupPage } from '../hooks/useReleaseGroupPage';

const ReleaseGroupPage = () => {
    const releaseGroupPage = useReleaseGroupPage();

    return (
        <ReleaseGroupView
            releases={releaseGroupPage.state.releases}
            releaseGroupReleaseCovers={releaseGroupPage.state.releaseGroupReleaseCovers}
            pendingReleaseCoverIds={releaseGroupPage.state.pendingReleaseCoverIds}
            isLoadingReleases={releaseGroupPage.state.isLoadingReleases}
            releaseLoadFailed={releaseGroupPage.state.releaseLoadFailed}
            releaseGroupId={releaseGroupPage.state.releaseGroupId}
            onReleasePressed={releaseGroupPage.onReleasePressed}
            onRetryLoadReleases={releaseGroupPage.onRetryLoadReleases}
        />
    );
};

export default ReleaseGroupPage;
