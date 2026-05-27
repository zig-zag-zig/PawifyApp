import React from 'react';
import ReleaseView from '../components/ReleaseView';
import { useReleasePage } from '../hooks/useReleasePage';

const ReleasePage = () => {
    const releasePage = useReleasePage();

    return (
        <ReleaseView
            state={releasePage.state}
            onSongPressed={releasePage.onSongPressed}
            onLyricsOpened={releasePage.onLyricsOpened}
        />
    );
};

export default ReleasePage;
