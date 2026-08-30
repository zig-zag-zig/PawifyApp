import React from 'react';
import SearchView from '../components/SearchView';
import { useSearchPage } from '../hooks/useSearchPage';

const SearchPage = () => {
    const searchPage = useSearchPage();

    return (
        <SearchView
            query={searchPage.state.query}
            artists={searchPage.state.artists}
            artistProfileImages={searchPage.state.artistProfileImages}
            pendingArtistImageIds={searchPage.state.pendingArtistImageIds}
            isLoading={searchPage.state.isLoading}
            canLoadMore={searchPage.state.canLoadMore}
            onQueryChanged={searchPage.onQueryChanged}
            onSubmitSearch={searchPage.onSubmitSearch}
            onLoadMore={searchPage.onLoadMore}
            onArtistPressed={searchPage.onArtistPressed}
        />
    );
};

export default SearchPage;
