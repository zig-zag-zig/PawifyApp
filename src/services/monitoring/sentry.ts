import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import type React from 'react';
import { ENV } from '../../config/env';
import { setErrorReporter } from './reportError';

let initialized = false;

const sanitizeEvent: NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend'] = (event) => {
  delete event.user;
  return event;
};

function getUpdateGroup(): string | null {
  const manifest = Updates.manifest;
  if (!manifest || typeof manifest !== 'object' || !('metadata' in manifest)) {
    return null;
  }

  const metadata = manifest.metadata;
  if (!metadata || typeof metadata !== 'object' || !('updateGroup' in metadata)) {
    return null;
  }

  const updateGroup = metadata.updateGroup;
  return typeof updateGroup === 'string' ? updateGroup : null;
}

function tagExpoUpdate() {
  const scope = Sentry.getGlobalScope();
  scope.setTag('expo-update-id', Updates.updateId ?? 'embedded');
  scope.setTag('expo-is-embedded-update', String(Updates.isEmbeddedLaunch));

  const updateGroup = getUpdateGroup();
  if (updateGroup) {
    scope.setTag('expo-update-group-id', updateGroup);
  }
}

export function initErrorMonitoring() {
  if (initialized || !ENV.sentryEnabled || !ENV.sentryDsn) {
    return;
  }

  const options: Parameters<typeof Sentry.init>[0] = {
    dsn: ENV.sentryDsn,
    environment: ENV.appEnv,
    release: `pawify@${ENV.appVersion}`,
    dist: ENV.appBuildVersion ?? undefined,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    enableAutoSessionTracking: true,
    beforeSend: sanitizeEvent,
    initialScope: {
      tags: {
        app: 'pawifyapp',
      },
    },
  };

  if (ENV.sentryTracesSampleRate > 0) {
    options.tracesSampleRate = ENV.sentryTracesSampleRate;
  }

  Sentry.init(options);

  initialized = true;
  setErrorReporter((error, context) => {
    Sentry.captureException(error, { extra: context });
  });
  tagExpoUpdate();
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

export function wrapWithErrorMonitoring<TProps extends object>(
  Component: React.ComponentType<TProps>,
): React.ComponentType<TProps> {
  if (!ENV.sentryEnabled || !ENV.sentryDsn) {
    return Component;
  }

  return Sentry.wrap(Component as React.ComponentType<Record<string, unknown>>) as React.ComponentType<TProps>;
}
