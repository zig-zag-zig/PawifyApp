import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestLogContext = {
    requestId: string;
    endpoint?: string;
    method?: string;
    path?: string;
    userId?: string;
    taskId?: string;
    taskType?: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestLogContext>();

export const runWithRequestContext = <T>(context: RequestLogContext, handler: () => T): T => {
    return requestContextStorage.run(context, handler);
};

export const getRequestContext = (): RequestLogContext | undefined => {
    return requestContextStorage.getStore();
};

export const setRequestContextFields = (fields: Partial<RequestLogContext>): void => {
    const current = requestContextStorage.getStore();
    if (!current) {
        return;
    }

    Object.assign(current, fields);
};
