import { getTaskResultForUser } from '../../../services/taskService.js';
import type { TaskUseCaseDependencies } from '../ports.js';

export const taskDependencies: TaskUseCaseDependencies = {
    taskResultGateway: {
        getTaskResultForUser,
    },
};
