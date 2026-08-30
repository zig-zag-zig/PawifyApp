import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { useGlobalSpinner } from '../../../contexts/GlobalSpinnerContext';
import { useContentReady } from '../../../hooks/useContentReady';
import type { ReleaseGroupReleaseListItem } from '@pawify/shared';
import type { ReleaseGroupNavigationProp } from '../../../types/navigation';
import ReleaseGroupCard from './ReleaseGroupCard';

interface ReleaseGroupViewProps {
    releases: ReleaseGroupReleaseListItem[];
    releaseGroupReleaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
    onReleasePressed: (release: ReleaseGroupReleaseListItem) => void;
}

const RELEASE_GROUP_TRANSITION_FALLBACK_MS = 600;

const ReleaseGroupView = ({
    releases,
    releaseGroupReleaseCovers,
    pendingReleaseCoverIds,
    onReleasePressed
}: ReleaseGroupViewProps) => {
    const navigation = useNavigation<ReleaseGroupNavigationProp>();
    const [isTransitionReady, setIsTransitionReady] = React.useState(false);
    const { isWaitingForContent, onContentReady } = useContentReady(
        false,
        releases.length > 0
    );
    useGlobalSpinner(isWaitingForContent || !isTransitionReady);

    React.useLayoutEffect(() => {
        let isCancelled = false;

        const markTransitionReady = () => {
            if (isCancelled) {
                return;
            }

            setIsTransitionReady(true);
        };

        const fallbackTimeout = setTimeout(
            markTransitionReady,
            RELEASE_GROUP_TRANSITION_FALLBACK_MS
        );
        const unsubscribeTransitionEnd = navigation.addListener('transitionEnd', event => {
            if (event.data?.closing) {
                return;
            }

            clearTimeout(fallbackTimeout);
            markTransitionReady();
        });

        return () => {
            isCancelled = true;
            clearTimeout(fallbackTimeout);
            unsubscribeTransitionEnd();
        };
    }, [navigation]);

    return (
        <ReleaseGroupCard
            releases={releases}
            releaseCovers={releaseGroupReleaseCovers}
            pendingReleaseCoverIds={pendingReleaseCoverIds}
            onPress={onReleasePressed}
            onContentReady={onContentReady}
        />
    );
};

export default ReleaseGroupView;
