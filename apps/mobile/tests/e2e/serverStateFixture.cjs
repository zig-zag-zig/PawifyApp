const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  artistId,
  releaseGroupId,
  releaseId,
  relatedArtistId,
} = require("./musicFixtures.cjs");

const schema = `
CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mbid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    disambiguation TEXT, type TEXT, begin_date TEXT, end_date TEXT,
    ended INTEGER NOT NULL DEFAULT 0, begin_area_name TEXT
);
CREATE TABLE artist_aliases (artist_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (artist_id, name));
CREATE TABLE artist_relationships (
    artist_id INTEGER NOT NULL, related_artist_id INTEGER, related_artist_mbid TEXT NOT NULL,
    related_artist_name TEXT NOT NULL, related_artist_type TEXT, type TEXT NOT NULL,
    direction TEXT NOT NULL, begin_date TEXT, end_date TEXT,
    PRIMARY KEY (artist_id, related_artist_mbid, type, direction)
);
CREATE TABLE release_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mbid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    primary_type TEXT, disambiguation TEXT, first_release_date TEXT
);
CREATE TABLE release_group_artists (
    release_group_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
);
CREATE TABLE releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mbid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    date TEXT, disambiguation TEXT, release_group_mbid TEXT, country TEXT, barcode TEXT, status TEXT
);
CREATE TABLE release_artists (
    release_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
);
CREATE TABLE media (
    release_id INTEGER NOT NULL, position INTEGER NOT NULL, format TEXT,
    track_count INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (release_id, position)
) WITHOUT ROWID;
CREATE TABLE recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mbid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    length INTEGER, disambiguation TEXT NOT NULL DEFAULT '', first_release_date TEXT,
    video INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE recording_artists (
    recording_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
    PRIMARY KEY (recording_id, position)
) WITHOUT ROWID;
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, release_id INTEGER NOT NULL, medium_position INTEGER NOT NULL,
    position INTEGER NOT NULL, number TEXT NOT NULL DEFAULT '', title TEXT, length INTEGER,
    recording_id INTEGER, UNIQUE (release_id, medium_position, position)
);
CREATE TABLE track_artists (
    track_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, artist_name TEXT NOT NULL,
    join_phrase TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
    PRIMARY KEY (track_id, position)
) WITHOUT ROWID;
CREATE TABLE recording_lyrics (
    recording_id INTEGER NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (recording_id, url)
);
CREATE TABLE external_links (
    entity_type TEXT NOT NULL, entity_mbid TEXT NOT NULL, rel_type TEXT NOT NULL,
    url TEXT NOT NULL, PRIMARY KEY (entity_type, entity_mbid, rel_type, url)
);
CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE image_services (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, url_template TEXT NOT NULL DEFAULT '');
CREATE TABLE entity_images (
    entity_type TEXT NOT NULL, entity_mbid TEXT NOT NULL, service_id INTEGER NOT NULL,
    image_token TEXT NOT NULL DEFAULT '', fetched_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_mbid)
) WITHOUT ROWID;
CREATE INDEX idx_entity_images_pending ON entity_images(entity_type, entity_mbid) WHERE service_id = 1;
CREATE VIRTUAL TABLE search_fts_artist USING fts5(entity_mbid UNINDEXED, heading, sortname, alias, primary_alias, comment, aux, ref_count UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE search_fts_release_group USING fts5(entity_mbid UNINDEXED, heading, releases, artistname, comment, aux, ref_count UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE search_fts_recording USING fts5(recording, recordingaccent, artist, artistname, creditname, release, comment, aux, content = '', contentless_delete = 1, tokenize = 'unicode61 remove_diacritics 2');
`;

const lyricsSchema = `
CREATE TABLE lyrics_lookup_state (
    lookup_key TEXT PRIMARY KEY, recording_mbid TEXT, query_fingerprint TEXT NOT NULL,
    resolved_url TEXT, provider TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('found', 'confirmed-miss', 'transient-failure')),
    checked_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL,
    genius_attempted_at INTEGER, musicbrainz_attempted_at INTEGER
) WITHOUT ROWID;
CREATE INDEX idx_lyrics_state_next_attempt ON lyrics_lookup_state(outcome, next_attempt_at);
CREATE INDEX idx_lyrics_state_recording ON lyrics_lookup_state(recording_mbid);
PRAGMA user_version = 1;
`;

const createE2EServerState = (backendRoot) => {
  const Database = require(
    path.join(backendRoot, "node_modules", "better-sqlite3"),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pawify-e2e-state-"));
  const musicDbPath = path.join(root, "mb.db");
  const lyricsDbPath = path.join(root, "lyrics.db");
  const db = new Database(musicDbPath);
  db.exec(schema);

  const aurora = db
    .prepare(
      "INSERT INTO artists (mbid, name, disambiguation, type, begin_date, ended, begin_area_name) VALUES (?, ?, ?, ?, ?, 0, ?)",
    )
    .run(
      artistId,
      "Aurora Test Ensemble",
      "Pawify E2E Fixture",
      "Group",
      "2018-01-01",
      "Oslo, Norway",
    ).lastInsertRowid;
  const nova = db
    .prepare(
      "INSERT INTO artists (mbid, name, disambiguation, type, begin_date, ended) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .run(
      relatedArtistId,
      "Nova Fixture",
      "Pawify E2E Related Fixture",
      "Person",
      "1995-06-01",
    ).lastInsertRowid;
  db.prepare("INSERT INTO artist_aliases VALUES (?, ?)").run(
    aurora,
    "ATE Fixture",
  );
  db.prepare(
    "INSERT INTO artist_relationships (artist_id, related_artist_id, related_artist_mbid, related_artist_name, related_artist_type, type, direction) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    aurora,
    nova,
    relatedArtistId,
    "Nova Fixture",
    "Person",
    "member of band",
    "backward",
  );

  const group = db
    .prepare(
      "INSERT INTO release_groups (mbid, title, primary_type, disambiguation, first_release_date) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      releaseGroupId,
      "Midnight Signals",
      "Album",
      "",
      "2025-04-18",
    ).lastInsertRowid;
  db.prepare("INSERT INTO release_group_artists VALUES (?, ?, ?, ?, ?)").run(
    group,
    aurora,
    "Aurora Test Ensemble",
    "",
    1,
  );
  const release = db
    .prepare(
      "INSERT INTO releases (mbid, title, date, disambiguation, release_group_mbid, country, barcode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      releaseId,
      "Midnight Signals",
      "2025-04-18",
      "",
      releaseGroupId,
      "NO",
      null,
      "Official",
    ).lastInsertRowid;
  db.prepare("INSERT INTO release_artists VALUES (?, ?, ?, ?, ?)").run(
    release,
    aurora,
    "Aurora Test Ensemble",
    "",
    1,
  );
  db.prepare("INSERT INTO media VALUES (?, 1, ?, 2, ?)").run(
    release,
    "Digital Media",
    "",
  );
  const signal = db
    .prepare("INSERT INTO recordings (mbid, title, length) VALUES (?, ?, ?)")
    .run(
      "pawify-e2e-recording-signal-drift",
      "Signal Drift",
      187000,
    ).lastInsertRowid;
  const skyline = db
    .prepare("INSERT INTO recordings (mbid, title, length) VALUES (?, ?, ?)")
    .run(
      "pawify-e2e-recording-skyline-loop",
      "Skyline Loop",
      214000,
    ).lastInsertRowid;
  db.prepare("INSERT INTO recording_artists VALUES (?, ?, ?, ?, ?)").run(
    signal,
    aurora,
    "Aurora Test Ensemble",
    "",
    1,
  );
  db.prepare("INSERT INTO recording_artists VALUES (?, ?, ?, ?, ?)").run(
    skyline,
    aurora,
    "Aurora Test Ensemble",
    "",
    1,
  );
  db.prepare(
    "INSERT INTO tracks (release_id, medium_position, position, number, title, length, recording_id) VALUES (?, 1, 1, ?, ?, ?, ?)",
  ).run(release, "1", "Signal Drift", 187000, signal);
  db.prepare(
    "INSERT INTO tracks (release_id, medium_position, position, number, title, length, recording_id) VALUES (?, 1, 2, ?, ?, ?, ?)",
  ).run(release, "2", "Skyline Loop", 214000, skyline);
  db.prepare("INSERT INTO external_links VALUES (?, ?, ?, ?)").run(
    "release",
    releaseId,
    "streaming",
    "https://open.spotify.com/album/pawify-e2e-midnight-signals",
  );

  db.prepare(
    "INSERT INTO search_fts_artist (entity_mbid, heading, sortname, alias, primary_alias, comment, aux, ref_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    artistId,
    "Aurora Test Ensemble",
    "Aurora Test Ensemble",
    "ATE Fixture",
    "Aurora Test Ensemble",
    "Pawify E2E Fixture",
    "",
    100,
  );
  db.prepare(
    "INSERT INTO search_fts_release_group (entity_mbid, heading, releases, artistname, comment, aux, ref_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    releaseGroupId,
    "Midnight Signals",
    "Midnight Signals",
    "Aurora Test Ensemble",
    "",
    "",
    1,
  );

  db.prepare("INSERT INTO _meta VALUES ('track_data_state', 'ready')").run();
  db.prepare("INSERT INTO _meta VALUES ('schema_sequence', 'e2e')").run();
  const service = db.prepare(
    "INSERT INTO image_services (id, name, url_template) VALUES (?, ?, ?)",
  );
  for (const [id, name, template] of [
    [0, "none", ""],
    [1, "pending", ""],
    [2, "caa_rel", "https://coverartarchive.org/release/{token}/front-500"],
    [
      3,
      "caa_rg",
      "https://coverartarchive.org/release-group/{token}/front-500",
    ],
    [4, "deezer", "https://cdn-images.dzcdn.net/images/{token}"],
    [5, "tidal", "https://resources.tidal.com/images/{token}"],
    [6, "discogs", "{token}"],
  ])
    service.run(id, name, template);
  db.close();

  const lyrics = new Database(lyricsDbPath);
  lyrics.exec(lyricsSchema);
  lyrics.close();
  return { root, musicDbPath, lyricsDbPath };
};

const cleanE2EServerState = (state) => {
  if (state?.root) fs.rmSync(state.root, { recursive: true, force: true });
};

module.exports = { createE2EServerState, cleanE2EServerState };
