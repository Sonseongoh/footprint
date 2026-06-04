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
      `);
      return db;
    })();
  }
  return dbPromise;
}
