import { getRequestContext } from './requestContext.js';
import { loggingConfig } from '../../config/runtimeConfig.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMetadata = Record<string, unknown>;

export interface Logger {
    debug(message: string, metadata?: LogMetadata): void;
    info(message: string, metadata?: LogMetadata): void;
    warn(message: string, metadata?: LogMetadata): void;
    error(message: string, metadata?: LogMetadata): void;
    child(scope: string): Logger;
}

const levelPriority: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const configuredLevel = (): LogLevel => {
    return loggingConfig.level;
};

const shouldLog = (level: LogLevel): boolean => {
    if (levelPriority[level] < levelPriority[configuredLevel()]) {
        return false;
    }
    return true;
};

const redactedKeyPattern =
    /(?:authorization|cookie|token|password|secret|otp|email|userId|userIds|uid|firebaseUid|deviceId|ipAddress|clientIp|sessionId|sessionFamilyId)/i;
const serviceName =
    process.env.LOG_SERVICE_NAME?.trim() || process.env.npm_package_name?.trim() || 'pawify-api';

const redactValue = (key: string, value: unknown): unknown => {
    if (redactedKeyPattern.test(key)) {
        return '[redacted]';
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: loggingConfig.includeErrorStacks ? value.stack : undefined,
        };
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactValue(key, item));
    }

    if (value && typeof value === 'object') {
        return sanitizeMetadata(value as LogMetadata);
    }

    return value;
};

const sanitizeMetadata = (metadata: LogMetadata): LogMetadata => {
    return Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [key, redactValue(key, value)]),
    );
};

const safeStringify = (value: unknown): string => {
    try {
        return JSON.stringify(value, (_key, item) =>
            typeof item === 'bigint' ? item.toString() : item,
        );
    } catch (error) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: serviceName,
            scope: 'common.logging',
            message: 'failed to serialize log entry',
            error: redactValue('error', error),
        });
    }
};

const mergeRequestContext = (metadata?: LogMetadata): LogMetadata | undefined => {
    const requestContext = getRequestContext();
    if (!requestContext) {
        return metadata;
    }

    if (!metadata || Object.keys(metadata).length === 0) {
        return { ...requestContext };
    }

    return {
        ...requestContext,
        ...metadata,
    };
};

const emit = (scope: string, level: LogLevel, message: string, metadata?: LogMetadata): void => {
    if (!shouldLog(level)) {
        return;
    }

    const mergedMetadata = mergeRequestContext(metadata);
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        service: serviceName,
        scope,
        message,
        ...(mergedMetadata ? sanitizeMetadata(mergedMetadata) : {}),
    };
    const line = safeStringify(payload);

    if (level === 'error') {
        console.error(line);
        return;
    }

    if (level === 'warn') {
        console.warn(line);
        return;
    }

    console.log(line);
};

export const createLogger = (scope: string): Logger => ({
    debug: (message, metadata) => emit(scope, 'debug', message, metadata),
    info: (message, metadata) => emit(scope, 'info', message, metadata),
    warn: (message, metadata) => emit(scope, 'warn', message, metadata),
    error: (message, metadata) => emit(scope, 'error', message, metadata),
    child: (childScope) => createLogger(`${scope}.${childScope}`),
});
