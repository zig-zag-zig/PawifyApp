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
            onReleasePressed={releaseGroupPage.onReleasePressed}
        />
    );
};

export default ReleaseGroupPage;
