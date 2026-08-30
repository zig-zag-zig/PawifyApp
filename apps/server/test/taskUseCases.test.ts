import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ForbiddenError, NotFoundError } from '../src/common/http/errors.js';
import { createGetTaskResultUseCase } from '../src/features/tasks/usecases/getTaskResult.js';
import type { TaskUseCaseDependencies } from '../src/features/tasks/ports.js';
import type {
    BackgroundTaskResultPayload,
    TaskResultResponse,
} from '../src/utils/types/taskTypes.js';

const taskResult: TaskResultResponse<BackgroundTaskResultPayload> = {
    taskId: 'task-1',
    type: 'artist_profile_images',
    status: 'completed',
    createdAt: 100,
    completedAt: 200,
    result: {
        artists: {
            'artist-1': 'https://example.com/artist.jpg',
        },
    },
};

describe('task use cases', () => {
    it('returns the task result when it belongs to the authenticated user', () => {
        const dependencies: TaskUseCaseDependencies = {
            taskResultGateway: {
                getTaskResultForUser(userId, taskId) {
                    assert.equal(userId, 'user-1');
                    assert.equal(taskId, 'task-1');
                    return {
                        status: 'finished',
                        task: taskResult,
                    };
                },
            },
        };
        const useCase = createGetTaskResultUseCase(dependencies);

        assert.deepEqual(useCase('user-1', 'task-1'), taskResult);
    });

    it('maps missing and forbidden task lookups to HTTP errors', () => {
        const missingUseCase = createGetTaskResultUseCase({
            taskResultGateway: {
                getTaskResultForUser: () => ({ status: 'missing' }),
            },
        });
        const forbiddenUseCase = createGetTaskResultUseCase({
            taskResultGateway: {
                getTaskResultForUser: () => ({ status: 'forbidden' }),
            },
        });

        assert.throws(
            () => missingUseCase('user-1', 'task-1'),
            (error) => error instanceof NotFoundError && error.message === 'Task was not found',
        );
        assert.throws(
            () => forbiddenUseCase('user-1', 'task-1'),
            (error) =>
                error instanceof ForbiddenError &&
                error.message === 'Task does not belong to the authenticated user',
        );
    });
});
