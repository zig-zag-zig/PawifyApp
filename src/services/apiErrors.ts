export type ApiCallError = Error & {
  statusCode?: number;
  responseBody?: string;
  responseData?: unknown;
  userMessage?: string;
};

export const isApiCallError = (error: unknown): error is ApiCallError => {
  return error instanceof Error && (error.name === 'ApiCallError' || 'statusCode' in error);
};

const fallbackApiErrorMessage = 'Something went wrong. Please try again.';

const parseErrorResponse = (responseBody: string): unknown => {
  if (!responseBody.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(responseBody);
  } catch {
    return responseBody;
  }
};

const extractResponseMessage = (responseData: unknown): string | undefined => {
  if (typeof responseData === 'string') {
    return responseData.trim() || undefined;
  }

  if (!responseData || typeof responseData !== 'object') {
    return undefined;
  }

  const record = responseData as Record<string, unknown>;

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  if (record.error && typeof record.error === 'object') {
    const errorRecord = record.error as Record<string, unknown>;
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
      return errorRecord.message;
    }
  }

  return undefined;
};

const getDefaultStatusMessage = (statusCode: number): string => {
  if (statusCode === 401) {
    return 'Please sign in again.';
  }

  if (statusCode === 403) {
    return 'You do not have permission to do that.';
  }

  if (statusCode === 404) {
    return 'The requested item was not found.';
  }

  if (statusCode >= 500) {
    return fallbackApiErrorMessage;
  }

  return `Request failed (${statusCode}). Please try again.`;
};

export const createApiCallError = (statusCode: number, responseBody: string): ApiCallError => {
  const responseData = parseErrorResponse(responseBody);
  const serverMessage = extractResponseMessage(responseData);
  const userMessage = statusCode >= 500
    ? fallbackApiErrorMessage
    : serverMessage ?? getDefaultStatusMessage(statusCode);

  const error = new Error(userMessage) as ApiCallError;
  error.name = 'ApiCallError';
  error.statusCode = statusCode;
  error.responseBody = responseBody;
  error.responseData = responseData;
  error.userMessage = userMessage;

  return error;
};

export const createNetworkApiCallError = (cause: unknown): ApiCallError => {
  const error = new Error('Network request failed. Check your connection and try again.') as ApiCallError & {
    cause?: unknown;
  };
  error.name = 'ApiCallError';
  error.userMessage = error.message;
  error.cause = cause;

  return error;
};

export const getUserFacingErrorMessage = (
  error: unknown,
  fallback = fallbackApiErrorMessage,
): string => {
  if (isApiCallError(error)) {
    return error.userMessage ??
      (typeof error.statusCode === 'number' ? getDefaultStatusMessage(error.statusCode) : fallback);
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};
