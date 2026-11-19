/**
 * One-time, previewable migration of legacy Firebase state to the v3 canonical
 * shapes.
 *
 *   npx tsx scripts/migrateCanonicalState.ts --preview
 *   npx tsx scripts/migrateCanonicalState.ts --apply [--backup <file>] [--force]
 *
 * What it does:
 * - normalizes known-release values from legacy `true`/date-string shapes to the
 *   object baseline, resolving release-id keys through the local mirror;
 * - fills the Official content baseline from the local catalogue so the first scan
 *   stays silent (no notification storm);
 * - normalizes new-release entries to ISO dates and fills missing `releaseGroupId`
 *   through the local mirror.
 *
 * `--apply` refuses to write when an entry cannot be parsed, a release group id
 * cannot be resolved, or the mirror is unavailable, unless `--force` is passed.
 * A JSON backup is written before any mutation. The command never touches
 * artwork, the mirror or Redis.
 */
import fs from 'node:fs';
import path from 'node:path';

import { rtdb, db } from '../src/infrastructure/firebase/firebaseInit.js';
import {
    buildNewReleasesCollectionPayload,
    getNewReleasesMapDocRef,
} from '../src/services/firebase/refs.js';
import { buildKnownReleaseGroupStatePayload } from '../src/services/firebase/knownReleaseStateNormalization.js';
import { getArtistReleaseGroupCatalog } from '../src/services/musicbrainz/artistReleaseGroupCatalog.js';
import { getReleaseToGroupIdMapFromMirror } from '../src/infrastructure/musicDb/musicDbRepositories.js';
import {
    migrateKnownArtistState,
    migrateNewReleasesMap,
} from '../src/services/firebase/canonicalStateMigration.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const backupIndex = args.indexOf('--backup');
const explicitBackup = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
const backupPath =
    explicitBackup ??
    path.join('backups', `canonical-state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const main = async (): Promise<void> => {
    const knownSnapshot = await rtdb.ref('knownReleases').get();
    const knownRaw = knownSnapshot.val();
    const knownBackup: Record<string, unknown> = isObject(knownRaw) ? knownRaw : {};
    const knownCanonical: Record<string, Record<string, Record<string, unknown>>> = {};

    let knownEntries = 0;
    let knownResolvedReleaseIds = 0;
    const unparsedKnownKeys: string[] = [];
    const mirrorFailedArtists: string[] = [];

    for (const [userId, userRaw] of Object.entries(knownBackup)) {
        if (!isObject(userRaw)) continue;
        knownCanonical[userId] = {};
        for (const [artistId, artistRaw] of Object.entries(userRaw)) {
            if (!isObject(artistRaw)) {
                mirrorFailedArtists.push(`${userId}/${artistId}`);
                continue;
            }

            let catalog;
            try {
                catalog = await getArtistReleaseGroupCatalog(artistId);
            } catch {
                // Preview still works without a mirror; apply refuses unless forced.
                mirrorFailedArtists.push(`${userId}/${artistId}`);
                continue;
            }

            const keys = Object.keys(artistRaw);
            let releaseToGroup = new Map<string, string>();
            try {
                releaseToGroup =
                    keys.length > 0 ? getReleaseToGroupIdMapFromMirror(keys) : new Map();
            } catch {
                mirrorFailedArtists.push(`${userId}/${artistId}`);
            }

            const migrated = migrateKnownArtistState({
                rawGroups: artistRaw,
                releaseToGroup,
                groupsById: new Map(catalog.groups.map((group) => [group.id, group])),
                catalogComplete: catalog.complete,
            });
            knownEntries += keys.length;
            knownResolvedReleaseIds += migrated.resolvedFromReleaseIds;
            unparsedKnownKeys.push(
                ...migrated.unparsedKeys.map((key) => `${userId}/${artistId}/${key}`),
            );
            knownCanonical[userId]![artistId] = buildKnownReleaseGroupStatePayload(migrated.state);
        }
    }

    const userDocs = await db.collection('users').listDocuments();
    const newReleasesBackup: Record<string, unknown> = {};
    const newReleasesCanonical: Record<string, Record<string, unknown>> = {};
    const unresolvedGroupIds: string[] = [];
    const invalidKeys: string[] = [];

    for (const userDoc of userDocs) {
        const snapshot = await userDoc.collection('newReleases').doc('maps').get();
        if (!snapshot.exists) continue;
        const raw = snapshot.data();
        newReleasesBackup[userDoc.id] = raw ?? {};

        const releaseIds = isObject(raw)
            ? Object.values(raw)
                  .map((entry) =>
                      isObject(entry) && typeof entry.id === 'string' ? entry.id : null,
                  )
                  .filter((id): id is string => id !== null)
            : [];
        let releaseToGroup = new Map<string, string>();
        try {
            releaseToGroup =
                releaseIds.length > 0 ? getReleaseToGroupIdMapFromMirror(releaseIds) : new Map();
        } catch {
            // Reported as unresolved ids; apply refuses unless forced.
        }

        const migrated = migrateNewReleasesMap(raw, releaseToGroup);
        newReleasesCanonical[userDoc.id] = migrated.map;
        unresolvedGroupIds.push(...migrated.unresolvedGroupIds);
        invalidKeys.push(...migrated.invalidKeys);
    }

    const summary = {
        knownUsers: Object.keys(knownCanonical).length,
        knownEntries,
        knownResolvedReleaseIds,
        unparsedKnownValues: unparsedKnownKeys.length,
        mirrorFailedArtists: mirrorFailedArtists.length,
        newReleaseUsers: Object.keys(newReleasesCanonical).length,
        newReleaseEntries: Object.values(newReleasesCanonical).reduce(
            (sum, map) => sum + Object.keys(map).length,
            0,
        ),
        unresolvedGroupIds: unresolvedGroupIds.length,
        invalidKeys: invalidKeys.length,
        backupPath,
    };

    console.log(JSON.stringify(summary, null, 2));
    if (unparsedKnownKeys.length > 0) {
        console.log('Unparseable known-release entries:', unparsedKnownKeys.join(', '));
    }
    if (mirrorFailedArtists.length > 0) {
        console.log(
            'Artists skipped because the mirror was unavailable:',
            mirrorFailedArtists.join(', '),
        );
    }
    if (unresolvedGroupIds.length > 0) {
        console.log('Unresolved new-release group ids:', unresolvedGroupIds.join(', '));
    }
    if (invalidKeys.length > 0) {
        console.log('Invalid new-release keys:', invalidKeys.join(', '));
    }

    if (!apply) {
        console.log('preview only; re-run with --apply to write the canonical state.');
        return;
    }

    const blocking =
        unparsedKnownKeys.length > 0 ||
        mirrorFailedArtists.length > 0 ||
        unresolvedGroupIds.length > 0 ||
        invalidKeys.length > 0;
    if (blocking && !force) {
        console.error(
            'Refusing to apply with unresolved/invalid/mirror-skipped entries. Resolve them or pass --force to preserve documented unresolved records in the backup report.',
        );
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(
        backupPath,
        JSON.stringify(
            {
                createdAt: new Date().toISOString(),
                knownReleases: knownBackup,
                newReleases: newReleasesBackup,
                summary,
                unparsedKnownKeys,
                mirrorFailedArtists,
                unresolvedGroupIds,
                invalidKeys,
            },
            null,
            2,
        ),
    );

    for (const [userId, artists] of Object.entries(knownCanonical)) {
        for (const [artistId, payload] of Object.entries(artists)) {
            const ref = rtdb.ref(`knownReleases/${userId}/${artistId}`);
            if (Object.keys(payload).length === 0) {
                await ref.remove();
            } else {
                await ref.set(payload);
            }
        }
    }

    for (const [userId, map] of Object.entries(newReleasesCanonical)) {
        await getNewReleasesMapDocRef(userId).set(
            buildNewReleasesCollectionPayload(
                map as Parameters<typeof buildNewReleasesCollectionPayload>[0],
            ),
        );
    }

    console.log(`applied; backup written to ${backupPath}`);
};

main().catch((error) => {
    console.error('canonical state migration failed', error);
    process.exit(1);
});
