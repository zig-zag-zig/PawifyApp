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
    it('has no MusicBrainz transport at all: the mirror is the only catalogue', () => {
        const names = sourceFiles().map((file) =>
            path.relative(SRC, file).split(path.sep).join('/'),
        );

        assert.equal(
            names.includes('services/musicApi/musicBrainzClient.ts'),
            false,
            'musicBrainzClient.ts must stay removed',
        );
        assert.equal(
            names.includes('services/musicApi/musicBrainzLyricsFallback.ts'),
            false,
            'musicBrainzLyricsFallback.ts must stay removed',
        );

        const importers = names.filter((name) =>
            fs.readFileSync(path.join(SRC, name), 'utf-8').includes('musicBrainzClient.js'),
        );
        assert.deepEqual(importers, []);
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
