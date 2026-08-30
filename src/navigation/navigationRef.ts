import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';

/**
 * Imperative access to the root navigator from non-screen modules
 * (e.g. notification tap handling). Passed to the NavigationContainer
 * in App.tsx.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Runs the navigation action once the navigator is ready. Safe to call
 * during cold start before the container has mounted.
 */
export const runWhenNavigationReady = (navigate: () => void): void => {
    if (navigationRef.isReady()) {
        navigate();
        return;
    }

    const unsubscribe = navigationRef.addListener('state', () => {
        unsubscribe();
        if (navigationRef.isReady()) {
            navigate();
        }
    });
};
