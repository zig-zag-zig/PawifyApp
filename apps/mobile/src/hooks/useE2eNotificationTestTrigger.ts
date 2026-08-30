import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import {
    isE2eTestEnvironment,
    parseE2eReleaseNotificationUrl,
    postE2eReleaseNotification,
} from '../services/notifications/e2eNotificationTestTrigger';

/**
 * No-op outside `e2e-test` builds. Inside them, it listens for the
 * `pawify://e2e/release-notification` test trigger link and posts a local
 * notification shaped like the backend's new-release push so Maestro can
 * drive the full notification-tap pipeline. See e2eNotificationTestTrigger.
 */
export function useE2eNotificationTestTrigger() {
    useEffect(() => {
        if (!isE2eTestEnvironment()) {
            return;
        }

        let cancelled = false;

        const handleUrl = (url: string | null | undefined) => {
            const params = parseE2eReleaseNotificationUrl(url);
            if (!params) {
                return;
            }

            void postE2eReleaseNotification(params).catch(error => {
                console.warn('e2e: posting release notification failed', error);
            });
        };

        void Linking.getInitialURL().then(url => {
            if (!cancelled) {
                handleUrl(url);
            }
        });

        const subscription = Linking.addEventListener('url', event => handleUrl(event.url));

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);
}
