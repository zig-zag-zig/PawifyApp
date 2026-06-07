import React from 'react';
import type { NativeSyntheticEvent, TextInputSubmitEditingEventData } from 'react-native';
import { TextField } from '../../../components/ui';

interface SearchInputProps {
    query: string;
    onChangeText: (text: string) => void;
    onSubmitEditing: (text: string) => void;
}

const SearchInput = ({ query, onChangeText, onSubmitEditing }: SearchInputProps) => {
    const handleSubmitEditing = (
        event: NativeSyntheticEvent<TextInputSubmitEditingEventData>
    ) => {
        onSubmitEditing(event.nativeEvent.text);
    };

    return (
        <TextField
            placeholder="Search artists"
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
