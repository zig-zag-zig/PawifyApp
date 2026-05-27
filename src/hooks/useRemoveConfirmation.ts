import { useState } from 'react';

export function useRemoveConfirmation() {
    const [promptVisible, setPromptVisible] = useState(false);
    const [pendingIds, setPendingIds] = useState<string[]>([]);
    const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

    const requestRemove = (ids: string[], confirmAction: () => void) => {
        setPendingIds(ids);
        setOnConfirm(() => confirmAction);
        setPromptVisible(true);
    };

    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        setPromptVisible(false);
        setPendingIds([]);
        setOnConfirm(null);
    };

    const handleCancel = () => {
        setPromptVisible(false);
        setPendingIds([]);
        setOnConfirm(null);
    };

    return {
        promptVisible,
        pendingIds,
        requestRemove,
        handleConfirm,
        handleCancel,
    };
}