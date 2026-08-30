import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

export function useContentReady(isLoading: boolean, hasContent: boolean) {
    const [isContentReady, setIsContentReady] = useState(!hasContent);
    const revealInteractionRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const revealFrameRef = useRef<number | null>(null);

    const cancelPendingReveal = useCallback(() => {
        revealInteractionRef.current?.cancel();
        revealInteractionRef.current = null;

        if (revealFrameRef.current !== null) {
            cancelAnimationFrame(revealFrameRef.current);
            revealFrameRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isLoading && !hasContent) {
            cancelPendingReveal();
            setIsContentReady(false);
        }
    }, [cancelPendingReveal, hasContent, isLoading]);

    useEffect(() => cancelPendingReveal, [cancelPendingReveal]);

    const onContentReady = useCallback(() => {
        if (
            !hasContent
            || revealInteractionRef.current !== null
            || revealFrameRef.current !== null
        ) {
            return;
        }

        revealInteractionRef.current = InteractionManager.runAfterInteractions(() => {
            revealInteractionRef.current = null;
            revealFrameRef.current = requestAnimationFrame(() => {
                revealFrameRef.current = requestAnimationFrame(() => {
                    revealFrameRef.current = null;
                    setIsContentReady(true);
                });
            });
        });
    }, [hasContent]);

    useEffect(() => {
        if (!isLoading && hasContent && !isContentReady) {
            onContentReady();
        }
    }, [hasContent, isContentReady, isLoading, onContentReady]);

    return {
        isWaitingForContent: !isLoading && hasContent && !isContentReady,
        onContentReady,
    };
}
