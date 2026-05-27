import React, { useEffect } from 'react';
import { Container, Spinner } from './StyledComponents';
import { ConfirmationPrompt } from './ConfirmationPrompt';
import { SmartSelectableList } from './SmartSelectableList';
import { useRemoveConfirmation } from '../hooks/useRemoveConfirmation';
import { useToast } from '../components/ToastContext';

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
    renderCard: any;
    infoBannerMessage: string;
    promptMessage: string;
    selectionManagerRef: React.RefObject<{
        clearSelection: () => void;
    } | null>;
    flatListRef: React.RefObject<any>;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    initialNumToRender?: number;
    windowSize?: number;
    promptConfirmText: string;
}) {
    const { showToast } = useToast();
    const removeConfirmation = useRemoveConfirmation();

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
        <Container>
            <Spinner isLoading={isLoading} backdropVariant="strong" />
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
        </Container>
    );
}
