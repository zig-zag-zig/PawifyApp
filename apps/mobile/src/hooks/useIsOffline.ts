import * as NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * True only when NetInfo reports a real disconnection (isConnected === false).
 * The null/unknown state does not count as offline — we do not want to flash
 * the banner during startup before the first NetInfo reading arrives.
 */
export function useIsOffline(): boolean {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            setIsOffline(state.isConnected === false);
        });

        NetInfo.fetch().then((state) => {
            setIsOffline(state.isConnected === false);
        }).catch(() => {
            // Leave false — a failed probe is not proof of being offline.
        });

        return unsubscribe;
    }, []);

    return isOffline;
}
