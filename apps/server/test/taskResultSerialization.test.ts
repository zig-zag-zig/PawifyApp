import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    hasUndefinedValue,
    mergeTaskResult,
    toTaskResponse,
} from '../src/services/tasks/taskResultSerialization.js';
import type {
    BackgroundTaskRecord,
    BackgroundTaskResultPayload,
    ReleaseGroupCoverTaskResult,
} from '../src/utils/types/taskTypes.js';

describe('task result serialization', () => {
    it('merges task result patches while preserving existing nested fields', () => {
        const target: ReleaseGroupCoverTaskResult = {
            artistId: 'artist-1',
            covers: {
                releaseA: 'https://example.com/a.jpg',
                releaseB: null,
            },
        };
        const patch: Partial<ReleaseGroupCoverTaskResult> = {
            covers: {
                releaseB: 'https://example.com/b.jpg',
                releaseC: undefined,
            },
        };

        const merged = mergeTaskResult(target, patch);

        assert.deepEqual(merged, {
            artistId: 'artist-1',
            covers: {
                releaseA: 'https://example.com/a.jpg',
                releaseB: 'https://example.com/b.jpg',
                releaseC: undefined,
            },
        });
    });

    it('converts undefined result fields to null in task responses', () => {
        const task: BackgroundTaskRecord<BackgroundTaskResultPayload> = {
            id: 'task-1',
            userIds: ['user-1'],
            type: 'release_group_covers',
            status: 'completed',
            createdAt: 100,
            completedAt: 200,
            result: {
                artistId: 'artist-1',
                covers: {
                    releaseA: undefined,
                    releaseB: 'https://example.com/b.jpg',
                },
            },
            subtaskIds: ['subtask-1'],
            completedSubtaskIds: ['subtask-1'],
            subtaskCount: 1,
            completedSubtaskCount: 1,
        };

        assert.deepEqual(toTaskResponse(task), {
            taskId: 'task-1',
            type: 'release_group_covers',
            status: 'completed',
            createdAt: 100,
            completedAt: 200,
            result: {
                artistId: 'artist-1',
                covers: {
                    releaseA: null,
                    releaseB: 'https://example.com/b.jpg',
                },
            },
            error: undefined,
            parentTaskId: undefined,
            subtaskIds: ['subtask-1'],
            completedSubtaskIds: ['subtask-1'],
            subtaskCount: 1,
            completedSubtaskCount: 1,
        });
    });

    it('detects undefined values recursively before persistence', () => {
        assert.equal(hasUndefinedValue({ covers: { releaseA: undefined } }), true);
        assert.equal(hasUndefinedValue({ covers: ['cover-a', null] }), false);
    });
});
