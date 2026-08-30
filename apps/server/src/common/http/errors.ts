export class HttpError extends Error {
    readonly statusCode: number;
    readonly expose: boolean;

    constructor(statusCode: number, message: string, expose = true) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.expose = expose;
    }
}

export class BadRequestError extends HttpError {
    constructor(message: string) {
        super(400, message);
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message = 'User is not authenticated.') {
        super(401, message);
    }
}

export class ForbiddenError extends HttpError {
    constructor(message: string) {
        super(403, message);
    }
}

export class NotFoundError extends HttpError {
    constructor(message: string) {
        super(404, message);
    }
}

export const toHttpError = (error: unknown): HttpError => {
    if (error instanceof HttpError) {
        return error;
    }

    return new HttpError(500, 'Internal server error.', false);
};
