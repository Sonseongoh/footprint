/**
 * Web stand-in for the local SQLite database (expo-sqlite has no web support).
 * The web build exists only to serve the public /share page, which never touches
 * the offline queue or local visit projections — so every operation is a no-op
 * that reads as empty.
 */
interface WebDbStub {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<void>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
}

const stub: WebDbStub = {
  async execAsync() {},
  async runAsync() {},
  async getAllAsync<T>() {
    return [] as T[];
  },
  async getFirstAsync<T>() {
    return null as T | null;
  },
};

export function getDb(): Promise<WebDbStub> {
  return Promise.resolve(stub);
}
