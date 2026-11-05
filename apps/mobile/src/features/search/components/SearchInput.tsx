import React from 'react';
import type { NativeSyntheticEvent, TextInputSubmitEditingEventData } from 'react-native';
import { TextField } from '../../../components/ui';
import type { SearchScope } from '../../../services/searchHistoryStorage';

interface SearchInputProps {
    query: string;
    scope: SearchScope;
    onChangeText: (text: string) => void;
    onSubmitEditing: (text: string) => void;
}

// The placeholder names what the active tab searches, so it is never wrong
// about what typing here will look for.
// Search is type-agnostic: one query covers artists, release groups and tracks, and
// the tabs only filter results afterwards. The placeholder must not promise otherwise.
const PLACEHOLDER_BY_SCOPE: Record<SearchScope, string> = {
    artists: 'Search artists, releases, tracks',
    releases: 'Search artists, releases, tracks',
    tracks: 'Search artists, releases, tracks',
};

const SearchInput = ({ query, scope, onChangeText, onSubmitEditing }: SearchInputProps) => {
    const handleSubmitEditing = (
        event: NativeSyntheticEvent<TextInputSubmitEditingEventData>
    ) => {
        onSubmitEditing(event.nativeEvent.text);
    };

    return (
        <TextField
            placeholder={PLACEHOLDER_BY_SCOPE[scope]}
            value={query}
            onChangeText={onChangeText}
            onSubmitEditing={handleSubmitEditing}
            returnKeyType="search"
            capitalize={true}
            showClearButton={true}
        />
    );
};

export default SearchInput;
