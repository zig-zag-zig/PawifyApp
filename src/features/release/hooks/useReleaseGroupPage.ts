import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import type { ReleaseGroupReleaseListItem } from '../../../modules/models/models';
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

        const applyPartialReleaseCovers = (result: unknown) => {
            const covers = extractReleaseGroupReleaseCovers(result);
            const resolvedReleaseIds = missingCoverIds.filter(releaseId => covers[releaseId] !== undefined);
            if (resolvedReleaseIds.length === 0) {
                return;
            }

            setReleaseGroupReleaseCovers(prev => ({
                ...prev,
                ...covers,
            }));
            setPendingReleaseCoverIds(prev =>
                prev.filter(releaseId => !resolvedReleaseIds.includes(releaseId))
            );
        };

        const resolveReleaseCoverTask = async () => {
            try {
                const taskResult = await waitForTaskResult(releaseCoverTaskId, {
                    onPartialResult: partialResult => {
                        if (isCancelled) {
                            return;
                        }

                        applyPartialReleaseCovers(partialResult.result);
                    },
                    recreateTask: releaseGroupId
                        ? async () => {
                            const result = await getReleaseGroupReleases(releaseGroupId);
                            return result.releaseCoverTaskId;
                        }
                        : undefined,
                    recreateTaskDescription: 'getReleaseGroupReleases.releaseCoverTaskId',
                });
                const taskStatus = taskResult.status.toLowerCase();
                if (isCancelled) {
                    return;
                }

                if (taskStatus === 'completed') {
                    const covers = extractReleaseGroupReleaseCovers(taskResult.result);
                    if (Object.keys(covers).length > 0) {
                        setReleaseGroupReleaseCovers(prev => ({
                            ...prev,
                            ...covers,
                        }));
                    }
                }

                setPendingReleaseCoverIds([]);
            } catch (error) {
                console.error('release-group-page: resolve release-group cover task failed', error);
                if (!isCancelled) {
                    setPendingReleaseCoverIds([]);
                }
            }
        };

        void resolveReleaseCoverTask();

        return () => {
            isCancelled = true;
        };
    }, [
        initialReleaseCoverTaskId,
        getReleaseGroupReleases,
        releaseGroupId,
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
