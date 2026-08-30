import React, { useEffect } from 'react';
import { FlatList } from 'react-native';
import { ScreenContainer } from './ui';
import { ConfirmationPrompt } from './ConfirmationPrompt';
import { SmartSelectableList, type SelectableCardRenderProps } from './SmartSelectableList';
import { useRemoveConfirmation } from '../hooks/useRemoveConfirmation';
import { useContentReady } from '../hooks/useContentReady';
import { useGlobalSpinner } from '../contexts/GlobalSpinnerContext';
import { useToast } from '../contexts/ToastContext';

export function GenericList<T extends { id: string }>({
    items,
    selectionItems,
    isLoading,
    bannerVisible,
    setBannerVisible,
    onRemoveSelected,
    renderCard,
    infoBannerMessage,
    promptMessage,
    selectionManagerRef,
    flatListRef,
    onEndReached,
    onEndReachedThreshold,
    initialNumToRender,
    windowSize,
    promptConfirmText: removeConfirmationText,
}: {
    items: T[];
    selectionItems?: T[];
    isLoading: boolean;
    bannerVisible: boolean;
    setBannerVisible: (v: boolean) => void;
    onRemoveSelected: (ids: string[]) => void;
    renderCard: (props: SelectableCardRenderProps<T>) => React.ReactNode;
    infoBannerMessage: string;
    promptMessage: string;
    selectionManagerRef: React.RefObject<{
        clearSelection: () => void;
    } | null>;
    flatListRef: React.RefObject<FlatList<T> | null>;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    initialNumToRender?: number;
    windowSize?: number;
    promptConfirmText: string;
}) {
    const { showToast } = useToast();
    const removeConfirmation = useRemoveConfirmation();
    const { isWaitingForContent, onContentReady } = useContentReady(isLoading, items.length > 0);
    useGlobalSpinner(isLoading || isWaitingForContent);

    const handleRemoveSelected = (ids: string[]) => {
        removeConfirmation.requestRemove(ids, () => {
            actuallyRemoveSelected(ids);
        });
    };

    const actuallyRemoveSelected = (ids: string[]) => {
        onRemoveSelected(ids);
    };

    useEffect(() => {
        showToast(infoBannerMessage, 'info', () => setBannerVisible(false), bannerVisible);
    }, [bannerVisible]);

    return (
        <ScreenContainer>
            <SmartSelectableList
                selectionManagerRef={selectionManagerRef}
                flatListRef={flatListRef}
                items={items}
                selectionItems={selectionItems}
                onRemoveSelected={handleRemoveSelected}
                renderCard={renderCard}
                onEndReached={onEndReached}
                onEndReachedThreshold={onEndReachedThreshold}
                initialNumToRender={initialNumToRender}
                windowSize={windowSize}
                onContentReady={onContentReady}
            />
            <ConfirmationPrompt
                visible={removeConfirmation.promptVisible}
                message={promptMessage}
                confirmText={removeConfirmationText}
                cancelText="Cancel"
                danger={true}
                onConfirm={removeConfirmation.handleConfirm}
                onCancel={removeConfirmation.handleCancel}
            />
        </ScreenContainer>
    );
}
