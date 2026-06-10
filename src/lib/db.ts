/**
 * Local SQLite database (expo-sqlite, SDK 56 async API).
 *
 * Holds the offline check-in queue. Travel = weak signal, so every check-in is
 * written here first and synced to Supabase when connectivity returns. The
 * queue MUST be durable across app restarts (SQLite, not in-memory).
 */
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('footprint.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS checkin_queue (
          id          TEXT PRIMARY KEY,   -- client-generated UUID, used as the
                                          -- visit_event id for idempotent sync
          payload     TEXT NOT NULL,      -- JSON of the queued check-in
          photo_uri   TEXT,               -- local file uri, uploaded on sync
          created_at  TEXT NOT NULL,
          attempts    INTEGER NOT NULL DEFAULT 0,
          last_error  TEXT
        );
        -- Local-first fill projection. Mirrors the server's visits aggregate so
        -- the map fills instantly and offline, before/independent of sync.
        CREATE TABLE IF NOT EXISTS visits_local (
          region_id        TEXT PRIMARY KEY,
          country          TEXT NOT NULL,
          first_visited_at TEXT NOT NULL,
          last_visited_at  TEXT NOT NULL,
          visit_count      INTEGER NOT NULL DEFAULT 1
        );
        -- Per-city collection: which specific cities have been checked into.
        -- Drives depth-proportional region fill + visited city dots.
        CREATE TABLE IF NOT EXISTS visits_city_local (
          city_id          TEXT PRIMARY KEY,
          country          TEXT NOT NULL,
          first_visited_at TEXT NOT NULL,
          last_visited_at  TEXT NOT NULL,
          visit_count      INTEGER NOT NULL DEFAULT 1
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}
