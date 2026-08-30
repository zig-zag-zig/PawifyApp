import { describe, expect, it } from 'vitest';
import {
  getFirebaseAuthEmulatorUrl,
  getFirebaseProjectId,
} from './firebaseAuthEmulator';

describe('Firebase Auth e2e emulator helpers', () => {
  it('normalizes host and port values to an http origin', () => {
    expect(getFirebaseAuthEmulatorUrl('127.0.0.1:9099')).toBe('http://127.0.0.1:9099');
    expect(getFirebaseAuthEmulatorUrl('http://localhost:9099')).toBe('http://localhost:9099');
  });

  it('rejects unusable emulator host values', () => {
    expect(() => getFirebaseAuthEmulatorUrl('')).toThrow(/required/);
    expect(() => getFirebaseAuthEmulatorUrl('127.0.0.1')).toThrow(/host and port/);
    expect(() => getFirebaseAuthEmulatorUrl('https://127.0.0.1:9099')).toThrow(/http/);
    expect(() => getFirebaseAuthEmulatorUrl('127.0.0.1:9099/path')).toThrow(/path/);
  });

  it('validates the e2e Firebase project id', () => {
    expect(getFirebaseProjectId('demo-pawify-e2e')).toBe('demo-pawify-e2e');
    expect(() => getFirebaseProjectId('')).toThrow(/required/);
    expect(() => getFirebaseProjectId('bad')).toThrow(/valid Firebase project id/);
  });
});
