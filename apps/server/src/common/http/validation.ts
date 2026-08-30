import { BadRequestError } from './errors.js';

export const requireBodyObject = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestError('Request body must be an object');
    }

    return value as Record<string, unknown>;
};

export const requireString = (body: unknown, property: string): string => {
    const value = requireBodyObject(body)[property];

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestError(`The ${property} property in the body is required`);
    }

    return value.trim();
};

export const optionalString = (body: unknown, property: string): string | undefined => {
    const value = requireBodyObject(body)[property];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new BadRequestError(`The ${property} property in the body must be a string`);
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

export const requireBoolean = (body: unknown, property: string): boolean => {
    const value = requireBodyObject(body)[property];

    if (typeof value !== 'boolean') {
        throw new BadRequestError(`The ${property} property in the body must be a boolean`);
    }

    return value;
};

export const requireStringArray = (
    body: unknown,
    property: string,
    maxItems?: number,
): string[] => {
    const value = requireBodyObject(body)[property];

    if (!Array.isArray(value) || value.length === 0) {
        throw new BadRequestError(`The ${property} property in the body must be a non-empty array`);
    }

    const values = value.map((item) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
            throw new BadRequestError(`Every item in ${property} must be a non-empty string`);
        }

        return item.trim();
    });

    const uniqueValues = Array.from(new Set(values));

    if (maxItems !== undefined && uniqueValues.length > maxItems) {
        throw new BadRequestError(
            `The ${property} property in the body must contain at most ${maxItems} items`,
        );
    }

    return uniqueValues;
};

const parseIntegerValue = (value: unknown): number => {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        return Number.parseInt(value, 10);
    }

    return Number.NaN;
};

export const requireNullablePositiveInteger = (
    body: unknown,
    property: string,
    max?: number,
): number | null => {
    const value = requireBodyObject(body)[property];

    if (value === null) {
        return null;
    }

    const parsed = parseIntegerValue(value);

    if (!Number.isInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
        throw new BadRequestError(
            `The ${property} property in the body must be a positive integer or null`,
        );
    }

    return parsed;
};

export const optionalNonNegativeInteger = (
    body: unknown,
    property: string,
    fallback: number,
): number => {
    const value = requireBodyObject(body)[property];

    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = parseIntegerValue(value);

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestError(
            `The ${property} property in the body must be a non-negative integer`,
        );
    }

    return parsed;
};

export const optionalIntegerInRange = (
    body: unknown,
    property: string,
    fallback: number,
    min: number,
    max: number,
): number => {
    const value = requireBodyObject(body)[property];

    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = parseIntegerValue(value);

    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new BadRequestError(
            `The ${property} property in the body must be an integer between ${min} and ${max}`,
        );
    }

    return parsed;
};
