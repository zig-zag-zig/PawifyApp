import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(process.cwd(), 'src');

const sourceFiles = (): string[] => {
    const files: string[] = [];
    const walk = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.ts')) files.push(full);
        }
    };
    walk(SRC);
    return files;
};

describe('MusicBrainz runtime boundary', () => {
    it('allows the MusicBrainz transport only behind the lyrics fallback adapter', () => {
        const importers = sourceFiles()
            .filter((file) => !file.endsWith('musicBrainzClient.ts'))
            .filter((file) => fs.readFileSync(file, 'utf-8').includes('musicBrainzClient.js'))
            .map((file) => path.relative(SRC, file).split(path.sep).join('/'));

        assert.deepEqual(importers, ['services/musicApi/musicBrainzLyricsFallback.ts']);
    });

    it('has no v1/v2 route modules or contract variant selectors', () => {
        const names = sourceFiles().map((file) =>
            path.relative(SRC, file).split(path.sep).join('/'),
        );

        assert.equal(names.includes('api/v1Routes.ts'), false);
        assert.equal(names.includes('api/v2Routes.ts'), false);
        assert.equal(names.includes('api/useCaseVariants.ts'), false);
        assert.equal(names.includes('services/backgroundAssets/legacyAssetPlanner.ts'), false);
    });

    it('does not keep a catalogue MusicBrainz fallback reader', () => {
        const names = sourceFiles().map((file) =>
            path.relative(SRC, file).split(path.sep).join('/'),
        );

        for (const removed of [
            'infrastructure/musicDb/withMusicDb.ts',
            'services/musicbrainz/cachedReleaseCatalog.ts',
            'services/musicbrainz/releaseLookup.ts',
            'services/search/zeroResultApiFallback.ts',
        ]) {
            assert.equal(names.includes(removed), false, `${removed} must stay removed`);
        }
    });
});
