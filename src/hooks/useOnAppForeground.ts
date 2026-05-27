import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getExternalNavigationResumeDelayMs } from '../services/externalNavigation';

type UseOnAppForegroundOptions = {
    enabled?: boolean;
};

export type AppForegroundInfo = {
    previousAppState: AppStateStatus;
    inactiveMs: number | null;
};

export function useOnAppForeground(
    onForeground: (info: AppForegroundInfo) => void,
    options?: UseOnAppForegroundOptions
) {
    const enabled = options?.enabled ?? true;
    const callbackRef = useRef(onForeground);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const inactiveStartedAtRef = useRef<number | null>(
        AppState.currentState === 'active' ? null : Date.now()
    );
    const pendingForegroundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        callbackRef.current = onForeground;
    }, [onForeground]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const subscription = AppState.addEventListener('change', (nextAppState) => {
            const previousAppState = appStateRef.current;
            appStateRef.current = nextAppState;

            if (previousAppState === 'active' && nextAppState !== 'active') {
                inactiveStartedAtRef.current = Date.now();
            }

            if (nextAppState === 'active' && previousAppState !== 'active') {
                const inactiveStartedAt = inactiveStartedAtRef.current;
                const inactiveMs = inactiveStartedAt ? Date.now() - inactiveStartedAt : null;
                inactiveStartedAtRef.current = null;
                const foregroundInfo = {
                    previousAppState,
                    inactiveMs,
                };
                const delayMs = getExternalNavigationResumeDelayMs({
                    inactiveMs,
                    stagger: true,
                    staggerStepMs: 60,
                    maxStaggerMs: 900,
                });

                if (pendingForegroundTimeoutRef.current) {
                    clearTimeout(pendingForegroundTimeoutRef.current);
                    pendingForegroundTimeoutRef.current = null;
                }

                if (delayMs > 0) {
                    pendingForegroundTimeoutRef.current = setTimeout(() => {
                        pendingForegroundTimeoutRef.current = null;
                        callbackRef.current(foregroundInfo);
                    }, delayMs);
                    return;
                }

                callbackRef.current(foregroundInfo);
            }
        });

        return () => {
            if (pendingForegroundTimeoutRef.current) {
                clearTimeout(pendingForegroundTimeoutRef.current);
                pendingForegroundTimeoutRef.current = null;
            }
            subscription.remove();
        };
    }, [enabled]);
}
