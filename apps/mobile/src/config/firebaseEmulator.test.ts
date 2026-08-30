import { describe, expect, it } from 'vitest';
import { getFirebaseAuthEmulatorUrl } from './firebaseEmulator';

describe('getFirebaseAuthEmulatorUrl', () => {
  it('normalizes a local host and port', () => {
    expect(getFirebaseAuthEmulatorUrl('127.0.0.1:9199', 'e2e-test')).toBe('http://127.0.0.1:9199');
  });

  it('rejects emulator configuration for production', () => {
    expect(() => getFirebaseAuthEmulatorUrl('127.0.0.1:9199', 'production'))
      .toThrow('cannot be set for production builds');
  });

  it('rejects paths', () => {
    expect(() => getFirebaseAuthEmulatorUrl('http://127.0.0.1:9199/auth', 'e2e-test'))
      .toThrow('must not include a path');
  });
});
