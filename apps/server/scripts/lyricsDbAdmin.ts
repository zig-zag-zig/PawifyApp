/**
 * Preview/apply administration for the application-owned lyrics SQLite store.
 *
 * This is deliberately a command, not boot-time magic: request handling never
 * creates schema, and applying a migration/retention change is an explicit,
 * previewable operator step.
 *
 *   npx tsx scripts/lyricsDbAdmin.ts --preview
 *   npx tsx scripts/lyricsDbAdmin.ts --apply
 *   npx tsx scripts/lyricsDbAdmin.ts --housekeeping-preview
 *   npx tsx scripts/lyricsDbAdmin.ts --housekeeping-apply
 *
 * `LYRICS_DB_PATH` (or `--path <file>`) is required.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const pathIndex = args.indexOf('--path');
const explicitPath = pathIndex >= 0 ? args[pathIndex + 1] : undefined;
const databasePath = (explicitPath ?? process.env.LYRICS_DB_PATH)?.trim();

if (!databasePath) {
    console.error(
        'LYRICS_DB_PATH is required (or pass --path <file>). Refusing to guess a data location.',
    );
    process.exit(2);
}

process.env.LYRICS_DB_PATH = databasePath;

const apply = args.includes('--apply');
const housekeepingApply = args.includes('--housekeeping-apply');
const housekeepingPreview = args.includes('--housekeeping-preview');

const main = async (): Promise<void> => {
    const { LYRICS_DB_SCHEMA_VERSION, createLyricsDatabase, openLyricsDb } =
        await import('../src/infrastructure/lyricsDb/lyricsDbClient.js');
    const { applyLyricsHousekeeping, getLyricsStoreStats, previewLyricsHousekeeping } =
        await import('../src/infrastructure/lyricsDb/lyricsStateRepository.js');

    const exists = fs.existsSync(databasePath);
    console.log(`lyrics database: ${databasePath}`);
    console.log(`schema version: ${LYRICS_DB_SCHEMA_VERSION}`);
    console.log(`exists: ${exists}`);

    if (housekeepingPreview || housekeepingApply) {
        if (!exists) {
            console.error('Nothing to do: the lyrics database does not exist yet.');
            process.exit(1);
        }
        const plan = housekeepingPreview ? previewLyricsHousekeeping() : applyLyricsHousekeeping();
        console.log(
            `${housekeepingApply ? 'applied' : 'preview'} housekeeping: rows=${plan.removableRows}, found=${plan.removableFound}, miss/failure=${plan.removableMisses}/${plan.removableFailures}`,
        );
        console.log('stats:', getLyricsStoreStats());
        return;
    }

    if (!apply) {
        console.log(
            exists
                ? 'preview: schema is present; re-run with --apply to apply the migration check.'
                : 'preview: database and schema will be created by --apply.',
        );
        if (exists) {
            const db = openLyricsDb(databasePath);
            db.close();
            console.log('preview: existing database passes the schema version check.');
            console.log('stats:', getLyricsStoreStats());
        }
        return;
    }

    createLyricsDatabase(databasePath);
    console.log('apply: lyrics database schema is present at the expected version.');
    console.log('stats:', getLyricsStoreStats());
};

main().catch((error) => {
    console.error('lyrics DB administration failed', error);
    process.exit(1);
});
