import type {
    BackgroundTaskRecord,
    BackgroundTaskResultPayload,
    TaskResultResponse,
} from '../../utils/types/taskTypes.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

const toJsonSafeValue = (value: unknown): unknown => {
    if (value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((item) => toJsonSafeValue(item));
    }

    if (isPlainObject(value)) {
        const result: Record<string, unknown> = {};

        for (const [key, nestedValue] of Object.entries(value)) {
            result[key] = toJsonSafeValue(nestedValue);
        }

        return result;
    }

    return value;
};

export const mergeTaskResult = <T extends object>(
    target: T | undefined,
    patch: Partial<T> | void,
): T | undefined => {
    if (!patch) {
        return target;
    }

    if (!target) {
        return patch as T;
    }

    const merged = { ...target } as Record<string, unknown>;

    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        const currentValue = merged[key];

        if (isPlainObject(currentValue) && isPlainObject(value)) {
            merged[key] = {
                ...currentValue,
                ...value,
            };
            continue;
        }

        merged[key] = value;
    }

    return merged as T;
};

export const toTaskResponse = (
    task: BackgroundTaskRecord<BackgroundTaskResultPayload>,
): TaskResultResponse<BackgroundTaskResultPayload> => {
    return {
        taskId: task.id,
        type: task.type,
        status: task.status,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        result:
            task.result === undefined
                ? undefined
                : (toJsonSafeValue(task.result) as BackgroundTaskResultPayload),
        error: task.error,
        parentTaskId: task.parentTaskId,
        subtaskIds: task.subtaskIds,
        completedSubtaskIds: task.completedSubtaskIds,
        subtaskCount: task.subtaskCount,
        completedSubtaskCount: task.completedSubtaskCount,
    };
};

export const hasUndefinedValue = (value: unknown): boolean => {
    if (value === undefined) {
        return true;
    }

    if (Array.isArray(value)) {
        return value.some((item) => hasUndefinedValue(item));
    }

    if (isPlainObject(value)) {
        return Object.values(value).some((item) => hasUndefinedValue(item));
    }

    return false;
};
