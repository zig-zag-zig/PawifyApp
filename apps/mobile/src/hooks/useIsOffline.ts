import * as NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * True only when the device is genuinely offline.
 *
 * The correct signal is lifecycle-aware, not time-gated. The standard pattern
 * (register the connectivity listener on resume, unregister on pause) is used
 * here so a backgrounded app never observes — and therefore never records — a
 * suspended-network "offline" reading:
 *
 * - While backgrounded, Android suspends the app's view of the network and can
 *   report "no active network" even though connectivity is fine. We unsubscribe
 *   on `inactive`/`background`, so that suspended reading can never reach us.
 * - On return to `active` we re-derive from `NetInfo.fetch()`, the live state —
 *   so resume cannot replay a stale `false` captured before suspension.
 *
 * `isConnected === false` is used (existence-level, like Android's
 * hasActiveNetwork). The null/unknown and isInternetReachable fields are not
 * used for the banner: null means "not yet known" (never offline) and
 * reachability re-validation is exactly the transient that produces false
 * offline readings on unlock/foreground.
 */
export function useIsOffline(): boolean {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        let unsubscribeNetInfo: (() => void) | null = null;

        const applyState = (isConnected: boolean | null) => {
            setIsOffline(isConnected === false);
        };

        const startListening = () => {
            if (unsubscribeNetInfo) {
                return;
            }

            unsubscribeNetInfo = NetInfo.addEventListener((state) => {
                applyState(state.isConnected);
            });

            // Re-derive from live state on (re)subscribe — same as re-registering
            // the native callback delivering the current default network.
            NetInfo.fetch()
                .then((state) => applyState(state.isConnected))
                .catch(() => {
                    // A failed probe is not proof of being offline.
                });
        };

        const stopListening = () => {
            unsubscribeNetInfo?.();
            unsubscribeNetInfo = null;
        };

        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                startListening();
            } else {
                // background / inactive: stop observing so suspended-network
                // readings cannot flip the banner on.
                stopListening();
            }
        });

        if (AppState.currentState === 'active') {
            startListening();
        }

        return () => {
            stopListening();
            appStateSubscription.remove();
        };
    }, []);

    return isOffline;
}
