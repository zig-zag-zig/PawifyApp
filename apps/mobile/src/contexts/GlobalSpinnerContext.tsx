import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '../components/ui/Spinner';

type GlobalSpinnerContextValue = {
    setSourceActive: (sourceId: string, active: boolean) => void;
};

const GlobalSpinnerContext = createContext<GlobalSpinnerContextValue | null>(null);
let nextSpinnerSourceId = 0;

export const GlobalSpinnerProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeSourceIds, setActiveSourceIds] = useState<Set<string>>(() => new Set());

    const setSourceActive = useCallback((sourceId: string, active: boolean) => {
        setActiveSourceIds(currentSourceIds => {
            const nextSourceIds = new Set(currentSourceIds);

            if (active) {
                nextSourceIds.add(sourceId);
            } else {
                nextSourceIds.delete(sourceId);
            }

            if (nextSourceIds.size === currentSourceIds.size) {
                return currentSourceIds;
            }

            return nextSourceIds;
        });
    }, []);
    const contextValue = useMemo(
        () => ({ setSourceActive }),
        [setSourceActive]
    );

    return (
        <GlobalSpinnerContext.Provider value={contextValue}>
            <View style={styles.container}>
                {children}
                <Spinner isLoading={activeSourceIds.size > 0} backdropVariant="strong" />
            </View>
        </GlobalSpinnerContext.Provider>
    );
};

export function useGlobalSpinner(isLoading: boolean) {
    const context = useContext(GlobalSpinnerContext);
    const sourceIdRef = useRef<string | null>(null);

    if (!sourceIdRef.current) {
        nextSpinnerSourceId += 1;
        sourceIdRef.current = `global-spinner-source-${nextSpinnerSourceId}`;
    }

    useLayoutEffect(() => {
        if (!context) {
            return;
        }

        const sourceId = sourceIdRef.current!;
        context.setSourceActive(sourceId, isLoading);

        return () => {
            context.setSourceActive(sourceId, false);
        };
    }, [context, isLoading]);
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
