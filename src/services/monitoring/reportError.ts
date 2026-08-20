type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: ErrorReporter | null = null;

/**
 * Installs the active error reporter (currently the Sentry bridge in
 * services/monitoring/sentry). Kept as an indirection so core modules
 * (task runtime, notifications, image cache) can report errors without
 * importing the Sentry SDK into their module graph.
 */
export function setErrorReporter(nextReporter: ErrorReporter): void {
    reporter = nextReporter;
}

/** Reports an error to the installed reporter; no-op until one is set. */
export function captureAppError(error: unknown, context?: Record<string, unknown>): void {
    reporter?.(error, context);
}
