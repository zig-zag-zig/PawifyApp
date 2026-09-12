import * as NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';

/**
 * Debounce so a brief disconnect (radio handoff, or a stale `false` reading
 * NetInfo can emit as it re-polls on app resume) never flashes the banner.
 * Real offline states persist well past this window.
 */
const OFFLINE_HOLD_MS = 1000;

/**
 * True only when NetInfo reports a real disconnection (isConnected === false)
 * that has held for OFFLINE_HOLD_MS. The null/unknown state never counts as
 * offline, so the banner cannot appear during startup before the first
 * NetInfo reading, nor flicker on transient readings.
 */
export function useIsOffline(): boolean {
    const [isOffline, setIsOffline] = useState(false);
    const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const clearOfflineTimer = () => {
            if (offlineTimerRef.current !== null) {
                clearTimeout(offlineTimerRef.current);
                offlineTimerRef.current = null;
            }
        };

        const applyConnectedState = (isConnected: boolean | null) => {
            if (isConnected === false) {
                // Wait for the state to hold before declaring offline.
                if (offlineTimerRef.current === null) {
                    offlineTimerRef.current = setTimeout(() => {
                        offlineTimerRef.current = null;
                        setIsOffline(true);
                    }, OFFLINE_HOLD_MS);
                }
                return;
            }

            // Connected or unknown — cancel any pending offline transition and
            // clear the flag immediately.
            clearOfflineTimer();
            setIsOffline(false);
        };

        const unsubscribe = NetInfo.addEventListener((state) => {
            applyConnectedState(state.isConnected);
        });

        NetInfo.fetch()
            .then((state) => applyConnectedState(state.isConnected))
            .catch(() => {
                // Leave false — a failed probe is not proof of being offline.
            });

        return () => {
            clearOfflineTimer();
            unsubscribe();
        };
    }, []);

    return isOffline;
}
