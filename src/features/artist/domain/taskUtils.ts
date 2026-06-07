import type { QueuedTask } from '../../../hooks/useTaskManager';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';

export function getErrorMessage(error: unknown, fallback: string): string {
    return getUserFacingErrorMessage(error, fallback);
}

export function isTaskSettled(task: QueuedTask | undefined): boolean {
    if (!task) {
        return false;
    }

    return task.result !== undefined || task.error !== undefined;
}
