import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { ReleaseGroupReleaseListItem } from '@pawify/shared';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import { ReleaseNavigationProp, RootStackParamList } from '../../../types/navigation';
import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import { extractReleaseGroupReleaseCovers } from '../../../utils/taskResultMaps';
import { useReleaseApi } from '../api/releaseApi';
import type { ReleaseGroupPageController, ReleaseGroupPageUiState } from '../model/types';

type ReleaseGroupRouteProp = RouteProp<RootStackParamList, 'ReleaseGroup'>;

export function useReleaseGroupPage(): ReleaseGroupPageController {
    const route = useRoute<ReleaseGroupRouteProp>();
    const navigation = useNavigation<ReleaseNavigationProp>();
    const { releaseGroupReleaseCovers, setReleaseGroupReleaseCovers } = useCache();
    const { getReleaseGroupReleases, waitForTaskResultById } = useReleaseApi();
    const [pendingReleaseCoverIds, setPendingReleaseCoverIds] = useState<string[]>([]);
    const { releaseGroupId, releases, initialReleaseCoverTaskId, initialReleaseCovers } = route.params;

    useEffect(() => {
        const releaseCoverTaskId = initialReleaseCoverTaskId;
        const immediateCovers = normalizeNullableStringMap(initialReleaseCovers);

        // Merge immediate covers so cached values render without polling.
        if (Object.keys(immediateCovers).length > 0) {
            setReleaseGroupReleaseCovers(prev => mergeNullableStringMaps(prev, immediateCovers));
        }

        if (!releaseCoverTaskId) {
            setPendingReleaseCoverIds([]);
            return;
        }

        let isCancelled = false;
        const mergedCovers = mergeNullableStringMaps(releaseGroupReleaseCovers, immediateCovers);
        const missingCoverIds = releases
            .map(release => release.id)
            .filter(releaseId => mergedCovers[releaseId] === undefined);

        if (missingCoverIds.length === 0) {
            setPendingReleaseCoverIds([]);
            return;
        }

        setPendingReleaseCoverIds(missingCoverIds);

        const resolveReleaseCoverTask = async () => {
            await resolveNullableTaskMap({
                taskId: releaseCoverTaskId,
                expectedIds: missingCoverIds,
                waitForTaskResult: waitForTaskResultById,
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
        waitForTaskResultById,
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
