export function getFirebaseAuthEmulatorUrl(
  hostValue: string | null | undefined,
  appEnv: string,
): string | null {
  const trimmed = hostValue?.trim();
  if (!trimmed) {
    return null;
  }

  if (appEnv === 'production') {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST cannot be set for production builds');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must be host:port or http://host:port');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must use http://');
  }
  if (!parsed.hostname || !parsed.port) {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must include host and port');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST must not include a path, query, or hash');
  }

  return parsed.origin;
}
