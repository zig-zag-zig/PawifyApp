import * as Notifications from 'expo-notifications';
import { ENV } from '../../config/env';

/**
 * E2E-only test hook. In `e2e-test` builds, opening
 * `pawify://e2e/release-notification?releaseId=<id>&title=<t>&body=<b>`
 * posts a LOCAL notification with the exact same payload shape the backend
 * attaches to visible new-release pushes. This lets Maestro exercise the
 * real tap pipeline (notification shade → expo-notifications response →
 * parsing → navigation → release page → back) without real FCM delivery,
 * which the local E2E backend stubs by design.
 */

export const E2E_RELEASE_NOTIFICATION_PATH = 'e2e/release-notification';

export type E2eReleaseNotificationParams = {
    releaseId: string;
    title: string;
    body: string;
};

export const isE2eTestEnvironment = (): boolean => ENV.appEnv === 'e2e-test';

/**
 * Deterministic URL parse (Hermes has no URLSearchParams and expo-linking's
 * parse behavior depends on the runtime Constants), gated to this exact
 * path. Returns null for anything that is not a release-notification
 * trigger URL.
 *
 * Both '&' and ';' are accepted as parameter separators: E2E trigger links
 * pass through the Android shell (am start), where an unescaped '&' would
 * truncate the query string, so flows use ';'.
 */
export function parseE2eReleaseNotificationUrl(
    url: string | null | undefined,
): E2eReleaseNotificationParams | null {
    if (!url) {
        return null;
    }

    const withoutFragment = url.split('#')[0];
    const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(withoutFragment);
    if (!schemeMatch) {
        return null;
    }

    const rest = withoutFragment.slice(schemeMatch[0].length);
    const [rawPath, rawQuery = ''] = rest.split('?');
    const normalizedPath = rawPath.replace(/^\/+|\/+$/g, '');
    if (normalizedPath !== E2E_RELEASE_NOTIFICATION_PATH) {
        return null;
    }

    const queryParams: Record<string, string> = {};
    rawQuery.split(/[&;]/).forEach(pair => {
        if (!pair) {
            return;
        }
        const eq = pair.indexOf('=');
        const key = eq === -1 ? pair : pair.slice(0, eq);
        const value = eq === -1 ? '' : pair.slice(eq + 1);
        try {
            queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
        } catch {
            // Skip malformed percent-escapes rather than failing the trigger.
        }
    });

    const releaseId = queryParams.releaseId?.trim();
    if (!releaseId) {
        return null;
    }

    return {
        releaseId,
        title: queryParams.title || 'New release',
        body: queryParams.body || '',
    };
}

/** Posts the local notification; resolves false when permission is denied. */
export async function postE2eReleaseNotification(
    params: E2eReleaseNotificationParams,
): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    const finalStatus = status === 'granted'
        ? status
        : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') {
        return false;
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: params.title,
            body: params.body,
            data: {
                eventName: 'releases',
                payload: { releaseId: params.releaseId },
            },
        },
        trigger: null,
    });

    return true;
}
