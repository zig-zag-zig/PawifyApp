import React from 'react';
import ArtistView from '../components/ArtistView';
import { useArtistPage } from '../hooks/useArtistPage';

const ArtistPage = () => {
    const artistPage = useArtistPage();

    return (
        <ArtistView
            state={artistPage.state}
            onToggleFollow={artistPage.onToggleFollow}
            onArtistPressed={artistPage.onArtistPressed}
            onRelationshipsExpanded={artistPage.onRelationshipsExpanded}
            onReleaseGroupPressed={artistPage.onReleaseGroupPressed}
            onLoadMoreReleases={artistPage.onLoadMoreReleases}
            onRetry={artistPage.onRetry}
            onClearError={artistPage.onClearError}
        />
    );
};

export default ArtistPage;
