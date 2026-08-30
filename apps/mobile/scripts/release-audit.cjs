#!/usr/bin/env node

/**
 * npm audit wrapper for the release gate.
 *
 * Background: `image-size` (metro's build-time image-dimension reader,
 * pinned via expo SDK 57's @expo/metro -> metro) has two advisories
 * (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq — ICNS/JXL/HEIF parser
 * infinite-loop DoS) with NO patched version anywhere: advisory range is
 * <=2.0.2 (the latest published release), `patched: None`, empty references,
 * and the upstream repo is ARCHIVED (June 2026) — no fix will ever ship.
 * Every metro through 0.87.0 (latest) still depends on image-size@^1.0.2,
 * so no metro upgrade path exists either; a drop-in replacement with the
 * same `(buffer) -> {width,height}` API does not exist. Impact is
 * build-time only, on repo-local image assets (metro/src/Assets.js).
 *
 * Policy:
 * - Any advisory NOT in KNOWN_ACCEPTED_ADVISORIES fails the gate.
 * - Advisory chains are resolved transitively (npm reports the same leaf
 *   advisory at every level of the dependency chain).
 * - The allowlist is SELF-EXPIRING: if an accepted advisory no longer
 *   appears in the audit report, that means an upstream fix landed (or the
 *   tree changed) and the entry must be removed — the script fails loudly
 *   instead of silently carrying a stale exemption.
 *
 * Usage: node scripts/release-audit.cjs   (exits 0 on pass)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// id -> one-line rationale. Remove the entry when the advisory is fixed
// (the script enforces this once it stops appearing in the report).
// image-size advisories GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq were
// accepted while no upstream fix existed; the expo SDK-57 patch alignment
// (2026-08-30) brought fixed image-size versions, so the exemptions were
// removed per the self-expiring allowlist policy.
const KNOWN_ACCEPTED_ADVISORIES = new Map([
]);

function collectAdvisoryIds(packageName, vulnerabilities, seen = new Set()) {
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || seen.has(packageName)) {
    return [];
  }
  seen.add(packageName);

  const ids = [];
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'string') {
      if (via.startsWith('GHSA-')) {
        ids.push(via);
      } else {
        ids.push(...collectAdvisoryIds(via, vulnerabilities, seen));
      }
    } else if (typeof via === 'object' && via?.url) {
      const match = via.url.match(/GHSA-[\w-]+$/);
      if (match) {
        ids.push(match[0]);
      }
    }
  }
  return ids;
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: projectRoot,
    env: { ...process.env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
  });

  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error('[release-audit] npm audit did not return parseable JSON.');
    process.exit(1);
  }

  const vulnerabilities = report?.vulnerabilities ?? {};
  const blocking = [];
  const accepted = [];

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const advisoryIds = [...new Set(collectAdvisoryIds(packageName, vulnerabilities))];

    if (
      advisoryIds.length > 0 &&
      advisoryIds.every(id => KNOWN_ACCEPTED_ADVISORIES.has(id))
    ) {
      accepted.push({ packageName, advisoryIds });
      continue;
    }

    blocking.push({ packageName, severity: vulnerability.severity, advisoryIds });
  }

  if (accepted.length > 0) {
    console.log('[release-audit] accepted (known, unfixable upstream, build-time only):');
    for (const entry of accepted) {
      for (const id of entry.advisoryIds) {
        console.log(`  - ${entry.packageName}: ${id} — ${KNOWN_ACCEPTED_ADVISORIES.get(id)}`);
      }
    }
  }

  // Self-expiry: an accepted id that no longer appears means it got fixed
  // (or the tree changed) — fail loudly so the stale exemption is removed.
  const reportedIds = new Set();
  for (const entry of accepted) {
    entry.advisoryIds.forEach(id => reportedIds.add(id));
  }
  const staleExemptions = [...KNOWN_ACCEPTED_ADVISORIES.keys()].filter(id => !reportedIds.has(id));
  if (staleExemptions.length > 0) {
    console.error('[release-audit] KNOWN_ACCEPTED_ADVISORIES contains ids that are no longer reported:');
    for (const id of staleExemptions) {
      console.error(`  - ${id} — upstream fix likely landed; REMOVE this entry from scripts/release-audit.cjs`);
    }
    process.exit(1);
  }

  if (blocking.length > 0) {
    console.error('[release-audit] unaccepted vulnerabilities found:');
    for (const entry of blocking) {
      console.error(
        `  - ${entry.packageName} (${entry.severity}): ${entry.advisoryIds.join(', ') || 'no GHSA id'}`,
      );
    }
    process.exit(1);
  }

  console.log('[release-audit] npm audit: no unaccepted vulnerabilities.');
}

if (require.main === module) {
  runAudit();
}

module.exports = { KNOWN_ACCEPTED_ADVISORIES, collectAdvisoryIds, runAudit };
