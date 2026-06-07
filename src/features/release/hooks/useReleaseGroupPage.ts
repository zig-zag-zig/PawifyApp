import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { ReleaseGroupReleaseListItem } from '../../../shared/music';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import { ReleaseNavigationProp, RootStackParamList } from '../../../types/navigation';
import { extractReleaseGroupReleaseCovers } from '../../../utils/taskResultMaps';
import { useReleaseApi } from '../api/releaseApi';
import type { ReleaseGroupPageController, ReleaseGroupPageUiState } from '../model/types';

type ReleaseGroupRouteProp = RouteProp<RootStackParamList, 'ReleaseGroup'>;

export function useReleaseGroupPage(): ReleaseGroupPageController {
    const route = useRoute<ReleaseGroupRouteProp>();
    const navigation = useNavigation<ReleaseNavigationProp>();
    const { releaseGroupReleaseCovers, setReleaseGroupReleaseCovers } = useCache();
    const { getReleaseGroupReleases, waitForTaskResult } = useReleaseApi();
    const [pendingReleaseCoverIds, setPendingReleaseCoverIds] = useState<string[]>([]);
    const { releaseGroupId, releases, initialReleaseCoverTaskId } = route.params;

    useEffect(() => {
        const releaseCoverTaskId = initialReleaseCoverTaskId;
        if (!releaseCoverTaskId) {
            setPendingReleaseCoverIds([]);
            return;
        }

        let isCancelled = false;
        const missingCoverIds = releases
            .map(release => release.id)
            .filter(releaseId => releaseGroupReleaseCovers[releaseId] === undefined);

        if (missingCoverIds.length === 0) {
            setPendingReleaseCoverIds([]);
            return;
        }

        setPendingReleaseCoverIds(missingCoverIds);

        const resolveReleaseCoverTask = async () => {
            await resolveNullableTaskMap({
                taskId: releaseCoverTaskId,
                expectedIds: missingCoverIds,
                waitForTaskResult,
                extractMap: extractReleaseGroupReleaseCovers,
                onResolvedValues: (covers, resolvedReleaseIds) => {
                    if (isCancelled) {
                        return;
                    }

                    if (Object.keys(covers).length > 0) {
                        setReleaseGroupReleaseCovers(prev => ({
                            ...prev,
                            ...covers,
                        }));
                    }

                    setPendingReleaseCoverIds(prev =>
                        prev.filter(releaseId => !resolvedReleaseIds.includes(releaseId))
                    );
                },
                onError: error => {
                    console.error('release-group-page: resolve release-group cover task failed', error);
                },
                shouldFillMissingOnCompleted: () => false,
                shouldFillMissingOnError: false,
                shouldFillMissingOnNonCompleted: false,
                recreateTask: releaseGroupId
                    ? async () => {
                        const result = await getReleaseGroupReleases(releaseGroupId);
                        return result.releaseCoverTaskId;
                    }
                    : undefined,
                recreateTaskDescription: 'getReleaseGroupReleases.releaseCoverTaskId',
            });
        };

        void resolveReleaseCoverTask();

        return () => {
            isCancelled = true;
        };
    }, [
        initialReleaseCoverTaskId,
        getReleaseGroupReleases,
        releaseGroupId,
        releaseGroupReleaseCovers,
        releases,
        setReleaseGroupReleaseCovers,
        waitForTaskResult,
    ]);

    const state: ReleaseGroupPageUiState = {
        releases,
        releaseGroupReleaseCovers,
        pendingReleaseCoverIds,
    };

    const onReleasePressed = useCallback((release: ReleaseGroupReleaseListItem) => {
        navigation.navigate('Release', { releaseId: release.id });
    }, [navigation]);

    return {
        state,
        onReleasePressed,
    };
}
