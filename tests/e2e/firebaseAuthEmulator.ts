export function getFirebaseAuthEmulatorUrl(
  hostValue: string | null | undefined,
): string {
  const trimmed = hostValue?.trim();
  if (!trimmed) {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is required');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must be host:port or http://host:port');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must use http://');
  }
  if (!parsed.hostname || !parsed.port) {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must include host and port');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must not include a path, query, or hash');
  }

  return parsed.origin;
}

export function getFirebaseProjectId(projectIdValue: string | null | undefined): string {
  const trimmed = projectIdValue?.trim();
  if (!trimmed) {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_PROJECT_ID is required');
  }

  if (!/^[a-z][a-z0-9-]{4,29}$/i.test(trimmed)) {
    throw new Error('[e2e] EXPO_PUBLIC_FIREBASE_PROJECT_ID must be a valid Firebase project id');
  }

  return trimmed;
}
