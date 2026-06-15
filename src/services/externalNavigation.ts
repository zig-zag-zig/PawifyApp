import { Linking } from 'react-native';

const externalNavigationResumeWindowMs = 5 * 60 * 1000;
const defaultResumeQuietMs = 9000;
const defaultStaggerStepMs = 120;
const defaultMaxStaggerMs = 6000;

let lastExternalNavigationStartedAt = 0;
let resumeQuietUntil = 0;
let scheduledWorkCount = 0;

type ResumeDelayOptions = {
  inactiveMs?: number | null;
  quietMs?: number;
  stagger?: boolean;
  staggerStepMs?: number;
  maxStaggerMs?: number;
};

function markExternalNavigationStarted() {
  lastExternalNavigationStartedAt = Date.now();
}

function ensureResumeQuietPeriod(options: ResumeDelayOptions = {}) {
  const now = Date.now();
  const inactiveMs = options.inactiveMs;
  const hasRecentExternalNavigation =
    lastExternalNavigationStartedAt > 0 &&
    now - lastExternalNavigationStartedAt <= externalNavigationResumeWindowMs;
  const isShortExternalTrip =
    inactiveMs === undefined ||
    inactiveMs === null ||
    inactiveMs <= externalNavigationResumeWindowMs;

  if (!hasRecentExternalNavigation || !isShortExternalTrip) {
    if (resumeQuietUntil > now && options.quietMs) {
      resumeQuietUntil = Math.max(resumeQuietUntil, now + options.quietMs);
    }
    return;
  }

  const quietMs = options.quietMs ?? defaultResumeQuietMs;
  resumeQuietUntil = Math.max(resumeQuietUntil, now + quietMs);
  scheduledWorkCount = 0;
  lastExternalNavigationStartedAt = 0;
}

export function getExternalNavigationResumeDelayMs(options: ResumeDelayOptions = {}) {
  ensureResumeQuietPeriod(options);

  const remainingQuietMs = Math.max(0, resumeQuietUntil - Date.now());
  if (remainingQuietMs <= 0) {
    return 0;
  }

  if (!options.stagger) {
    return remainingQuietMs;
  }

  const staggerStepMs = options.staggerStepMs ?? defaultStaggerStepMs;
  const maxStaggerMs = options.maxStaggerMs ?? defaultMaxStaggerMs;
  const staggerMs = Math.min(scheduledWorkCount * staggerStepMs, maxStaggerMs);
  scheduledWorkCount += 1;

  return remainingQuietMs + staggerMs;
}

export async function openExternalUrl(url: string) {
  markExternalNavigationStarted();
  await Linking.openURL(url);
}

export function resetForTesting() {
  lastExternalNavigationStartedAt = 0;
  resumeQuietUntil = 0;
  scheduledWorkCount = 0;
}
