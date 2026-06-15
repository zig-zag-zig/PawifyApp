import { ENV } from '../config/env';
import {
  elapsedSince,
  shortenString,
  describeError,
  describeIds,
  describeNullableStringMap,
  describeValueShape,
  normalizeDiagnosticValue,
  type DiagnosticPayload,
} from './diagnosticFormatters';

export {
  elapsedSince,
  shortenString,
  describeError,
  describeIds,
  describeNullableStringMap,
  describeValueShape,
  type DiagnosticPayload,
};

const ARTIST_DIAGNOSTICS_ENABLED = ENV.artistDiagnosticsEnabled;

const diagnosticsRunStartedAt = Date.now();
const ARTIST_DIAGNOSTICS_RUN_ID = new Date(diagnosticsRunStartedAt).toISOString();

type DiagnosticLevel = 'log' | 'warn' | 'error';

export function shouldLogArtistTaskDiagnostics(operationName?: string, origin?: string): boolean {
  if (!ARTIST_DIAGNOSTICS_ENABLED) {
    return false;
  }

  const relevantOperations = new Set([
    'getArtistDetails',
    'getArtistReleases',
    'getReleaseGroupReleases',
    'downloadAndCacheImage',
  ]);

  return Boolean(
    (origin && (origin.startsWith('artist-page') || origin.startsWith('cached-image'))) ||
    (operationName && relevantOperations.has(operationName))
  );
}

export function diagnosticLog(scope: string, event: string, payload: DiagnosticPayload = {}) {
  writeDiagnostic('log', scope, event, payload);
}

export function diagnosticWarn(scope: string, event: string, payload: DiagnosticPayload = {}) {
  writeDiagnostic('warn', scope, event, payload);
}

export function diagnosticError(scope: string, event: string, payload: DiagnosticPayload = {}) {
  writeDiagnostic('error', scope, event, payload);
}

function writeDiagnostic(
  level: DiagnosticLevel,
  scope: string,
  event: string,
  payload: DiagnosticPayload
) {
  if (!ARTIST_DIAGNOSTICS_ENABLED) {
    return;
  }

  const normalizedPayload = normalizeDiagnosticValue({
    runId: ARTIST_DIAGNOSTICS_RUN_ID,
    msSinceRunStart: Date.now() - diagnosticsRunStartedAt,
    ...payload,
  });

  const prefix = `[artist-diag] ${scope}:${event}`;

  if (level === 'warn') {
    console.warn(prefix, normalizedPayload);
    return;
  }

  if (level === 'error') {
    console.error(prefix, normalizedPayload);
    return;
  }

  console.log(prefix, normalizedPayload);
}
