import type {
    BackgroundTaskResultPayload,
    TaskResultResponse,
} from '../../utils/types/taskTypes.js';

type TaskLookupResult =
    | { status: 'missing' }
    | { status: 'forbidden' }
    | { status: 'pending'; task: TaskResultResponse<BackgroundTaskResultPayload> }
    | { status: 'finished'; task: TaskResultResponse<BackgroundTaskResultPayload> };

interface TaskResultGateway {
    getTaskResultForUser(userId: string, taskId: string): TaskLookupResult;
}

export type TaskUseCaseDependencies = {
    taskResultGateway: TaskResultGateway;
};
