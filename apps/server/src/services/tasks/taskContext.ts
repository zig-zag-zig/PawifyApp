import { randomUUID } from 'crypto';

import { runWithRequestContext } from '../../common/logging/requestContext.js';
import type { RequestLogContext } from '../../common/logging/requestContext.js';
import type { BackgroundTaskType } from '../../utils/types/taskTypes.js';

export const toTaskRequestContext = (
    context: RequestLogContext | undefined,
    taskId: string,
    taskType: BackgroundTaskType,
    userId?: string,
): RequestLogContext => {
    const requestId = context?.requestId?.trim() || randomUUID();

    return {
        requestId,
        endpoint: context?.endpoint,
        method: context?.method,
        path: context?.path,
        userId: userId ?? context?.userId,
        taskId,
        taskType,
    };
};

export const withTaskContext = async <T>(
    context: RequestLogContext | undefined,
    handler: () => Promise<T>,
): Promise<T> => {
    if (!context) {
        return await handler();
    }

    return await runWithRequestContext(context, handler);
};
