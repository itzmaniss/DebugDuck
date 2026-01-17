/**
 * LocalDB - SQLite-based Local Storage
 *
 * Persists user profiles, sessions, and settings using Bun's built-in SQLite.
 * Data is stored in a `.debugduck/debugduck.db` file.
 *
 * Features:
 * 1. User profile persistence
 * 2. Session history storage (integrates with SessionHistory)
 * 3. Settings/configuration persistence
 * 4. Implements StorageAdapter interface for SessionHistory compatibility
 *
 * @module storage/localDB
 */

import { Database } from "bun:sqlite";
import type {
  LearningProfile,
  LearningSession,
  BugPattern,
  DebugDuckConfig,
  DEFAULT_CONFIG,
} from "../types";
import type { StorageAdapter } from "./sessionHistory";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for LocalDB
 */
export interface LocalDBOptions {
  /** Path to the database file (default: '.debugduck/debugduck.db') */
  dbPath?: string;
  /** Whether to run in memory only (for testing) */
  inMemory?: boolean;
}

/**
 * Serialized profile for database storage
 */
interface DBProfile {
  id: number;
  user_id: string;
  total_bugs: number;
  bugs_solved: number;
  bugs_gave_up: number;
  average_hints_per_bug: number;
  strengths: string; // JSON array
  weaknesses: string; // JSON array
  streak: number;
  last_active: string; // ISO date
  created_at: string; // ISO date
}

/**
 * Serialized session for database storage
 */
interface DBSession {
  id: string;
  bug_code: string;
  bug_language: string;
  bug_error_message: string | null;
  bug_line_number: number | null;
  bug_file_name: string | null;
  bug_type: string;
  hints_given: string; // JSON array
  solved: number; // 0 or 1
  gave_up: number; // 0 or 1
  hints_needed: number;
  time_spent: number;
  timestamp: string; // ISO date
}

/**
 * Serialized pattern for database storage
 */
interface DBPattern {
  id: number;
  user_id: string;
  type: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  average_hints_needed: number;
  improving: number; // 0 or 1
  contexts: string; // JSON array
}

/**
 * Key-value storage for generic data
 */
interface DBKeyValue {
  key: string;
  value: string;
}

// =============================================================================
// LocalDB Class
// =============================================================================

/**
 * SQLite-based local storage for DebugDuck.
 *
 * Usage:
 * ```typescript
 * const db = new LocalDB({ dbPath: '.debugduck/debugduck.db' });
 *
 * // Profile operations
 * await db.saveProfile(profile);
 * const profile = await db.getProfile('user-123');
 *
 * // Session operations
 * await db.saveSession(session);
 * const sessions = await db.getSessions({ limit: 10 });
 *
 * // Settings
 * await db.saveSetting('theme', 'dark');
 * const theme = await db.getSetting('theme');
 *
 * // Cleanup
 * db.close();
 * ```
 */
export class LocalDB implements StorageAdapter {
  private db: Database;
  private dbPath: string;

  constructor(options?: LocalDBOptions) {
    this.dbPath = options?.dbPath ?? ".debugduck/debugduck.db";

    if (options?.inMemory) {
      this.db = new Database(":memory:");
    } else {
      // Ensure directory exists
      const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
      if (dir) {
        try {
          require("fs").mkdirSync(dir, { recursive: true });
        } catch {
          // Directory might already exist
        }
      }
      this.db = new Database(this.dbPath);
    }

    this.initSchema();
  }

  // ===========================================================================
  // Schema Initialization
  // ===========================================================================

  /**
   * Initialize database schema.
   */
  private initSchema(): void {
    // Profiles table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        total_bugs INTEGER DEFAULT 0,
        bugs_solved INTEGER DEFAULT 0,
        bugs_gave_up INTEGER DEFAULT 0,
        average_hints_per_bug REAL DEFAULT 0,
        strengths TEXT DEFAULT '[]',
        weaknesses TEXT DEFAULT '[]',
        streak INTEGER DEFAULT 0,
        last_active TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        bug_code TEXT NOT NULL,
        bug_language TEXT NOT NULL,
        bug_error_message TEXT,
        bug_line_number INTEGER,
        bug_file_name TEXT,
        bug_type TEXT NOT NULL,
        hints_given TEXT DEFAULT '[]',
        solved INTEGER DEFAULT 0,
        gave_up INTEGER DEFAULT 0,
        hints_needed INTEGER DEFAULT 0,
        time_spent INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL
      )
    `);

    // Patterns table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        occurrences INTEGER DEFAULT 0,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        average_hints_needed REAL DEFAULT 0,
        improving INTEGER DEFAULT 0,
        contexts TEXT DEFAULT '[]',
        UNIQUE(user_id, type)
      )
    `);

    // Key-value store for settings and generic data
    this.db.run(`
      CREATE TABLE IF NOT EXISTS key_value (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create indexes for common queries
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_sessions_bug_type ON sessions(bug_type)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_patterns_user_id ON patterns(user_id)`,
    );
  }

  // ===========================================================================
  // Profile Operations
  // ===========================================================================

  /**
   * Save or update a user profile.
   */
  saveProfile(profile: LearningProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO profiles (
        user_id, total_bugs, bugs_solved, bugs_gave_up,
        average_hints_per_bug, strengths, weaknesses,
        streak, last_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_bugs = excluded.total_bugs,
        bugs_solved = excluded.bugs_solved,
        bugs_gave_up = excluded.bugs_gave_up,
        average_hints_per_bug = excluded.average_hints_per_bug,
        strengths = excluded.strengths,
        weaknesses = excluded.weaknesses,
        streak = excluded.streak,
        last_active = excluded.last_active
    `);

    stmt.run(
      profile.userId,
      profile.totalBugs,
      profile.bugsSolved,
      profile.bugsGaveUp,
      profile.averageHintsPerBug,
      JSON.stringify(profile.strengths),
      JSON.stringify(profile.weaknesses),
      profile.streak,
      profile.lastActive.toISOString(),
      profile.createdAt.toISOString(),
    );

    // Save patterns separately
    this.savePatterns(profile.userId, profile.patterns);
  }

  /**
   * Get a user profile by ID.
   */
  getProfile(userId: string): LearningProfile | null {
    const stmt = this.db.prepare(`SELECT * FROM profiles WHERE user_id = ?`);
    const row = stmt.get(userId) as DBProfile | null;

    if (!row) return null;

    // Load patterns
    const patterns = this.getPatterns(userId);

    return {
      userId: row.user_id,
      totalBugs: row.total_bugs,
      bugsSolved: row.bugs_solved,
      bugsGaveUp: row.bugs_gave_up,
      averageHintsPerBug: row.average_hints_per_bug,
      strengths: JSON.parse(row.strengths),
      weaknesses: JSON.parse(row.weaknesses),
      streak: row.streak,
      lastActive: new Date(row.last_active),
      createdAt: new Date(row.created_at),
      patterns,
    };
  }

  /**
   * Delete a user profile and all associated data.
   */
  deleteProfile(userId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM profiles WHERE user_id = ?`);
    const result = stmt.run(userId);

    // Also delete patterns
    this.db.prepare(`DELETE FROM patterns WHERE user_id = ?`).run(userId);

    return result.changes > 0;
  }

  /**
   * Get or create a default profile.
   */
  getOrCreateProfile(userId: string): LearningProfile {
    const existing = this.getProfile(userId);
    if (existing) return existing;

    const newProfile: LearningProfile = {
      userId,
      totalBugs: 0,
      bugsSolved: 0,
      bugsGaveUp: 0,
      averageHintsPerBug: 0,
      patterns: new Map(),
      strengths: [],
      weaknesses: [],
      streak: 0,
      lastActive: new Date(),
      createdAt: new Date(),
    };

    this.saveProfile(newProfile);
    return newProfile;
  }

  // ===========================================================================
  // Pattern Operations
  // ===========================================================================

  /**
   * Save patterns for a user.
   */
  private savePatterns(
    userId: string,
    patterns: Map<string, BugPattern>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (
        user_id, type, occurrences, first_seen, last_seen,
        average_hints_needed, improving, contexts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, type) DO UPDATE SET
        occurrences = excluded.occurrences,
        first_seen = excluded.first_seen,
        last_seen = excluded.last_seen,
        average_hints_needed = excluded.average_hints_needed,
        improving = excluded.improving,
        contexts = excluded.contexts
    `);

    for (const [, pattern] of patterns) {
      stmt.run(
        userId,
        pattern.type,
        pattern.occurrences,
        pattern.firstSeen.toISOString(),
        pattern.lastSeen.toISOString(),
        pattern.averageHintsNeeded,
        pattern.improving ? 1 : 0,
        JSON.stringify(pattern.contexts),
      );
    }
  }

  /**
   * Get patterns for a user.
   */
  private getPatterns(userId: string): Map<string, BugPattern> {
    const stmt = this.db.prepare(`SELECT * FROM patterns WHERE user_id = ?`);
    const rows = stmt.all(userId) as DBPattern[];

    const patterns = new Map<string, BugPattern>();

    for (const row of rows) {
      patterns.set(row.type, {
        type: row.type,
        occurrences: row.occurrences,
        firstSeen: new Date(row.first_seen),
        lastSeen: new Date(row.last_seen),
        averageHintsNeeded: row.average_hints_needed,
        improving: row.improving === 1,
        contexts: JSON.parse(row.contexts),
      });
    }

    return patterns;
  }

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  /**
   * Save a learning session.
   */
  saveSession(session: LearningSession): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, bug_code, bug_language, bug_error_message, bug_line_number,
        bug_file_name, bug_type, hints_given, solved, gave_up,
        hints_needed, time_spent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        bug_code = excluded.bug_code,
        bug_language = excluded.bug_language,
        bug_error_message = excluded.bug_error_message,
        bug_line_number = excluded.bug_line_number,
        bug_file_name = excluded.bug_file_name,
        bug_type = excluded.bug_type,
        hints_given = excluded.hints_given,
        solved = excluded.solved,
        gave_up = excluded.gave_up,
        hints_needed = excluded.hints_needed,
        time_spent = excluded.time_spent,
        timestamp = excluded.timestamp
    `);

    const timestamp =
      session.timestamp instanceof Date
        ? session.timestamp.toISOString()
        : session.timestamp;

    stmt.run(
      session.id,
      session.bug.code,
      session.bug.language,
      session.bug.errorMessage ?? null,
      session.bug.lineNumber ?? null,
      session.bug.fileName ?? null,
      session.bugType,
      JSON.stringify(session.hintsGiven),
      session.solved ? 1 : 0,
      session.gaveUp ? 1 : 0,
      session.hintsNeeded,
      session.timeSpent,
      timestamp,
    );
  }

  /**
   * Save multiple sessions in a transaction.
   */
  saveSessions(sessions: LearningSession[]): void {
    const transaction = this.db.transaction(() => {
      for (const session of sessions) {
        this.saveSession(session);
      }
    });
    transaction();
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): LearningSession | null {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    const row = stmt.get(sessionId) as DBSession | null;

    if (!row) return null;

    return this.dbSessionToLearningSession(row);
  }

  /**
   * Get sessions with optional filters.
   */
  getSessions(options?: {
    bugType?: string;
    solved?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): LearningSession[] {
    let query = `SELECT * FROM sessions WHERE 1=1`;
    const params: (string | number)[] = [];

    if (options?.bugType) {
      query += ` AND bug_type = ?`;
      params.push(options.bugType);
    }

    if (options?.solved !== undefined) {
      query += ` AND solved = ?`;
      params.push(options.solved ? 1 : 0);
    }

    if (options?.startDate) {
      query += ` AND timestamp >= ?`;
      params.push(options.startDate.toISOString());
    }

    if (options?.endDate) {
      query += ` AND timestamp <= ?`;
      params.push(options.endDate.toISOString());
    }

    query += ` ORDER BY timestamp DESC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET ?`;
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DBSession[];

    return rows.map((row) => this.dbSessionToLearningSession(row));
  }

  /**
   * Get recent sessions.
   */
  getRecentSessions(limit: number = 10): LearningSession[] {
    return this.getSessions({ limit });
  }

  /**
   * Delete a session.
   */
  deleteSession(sessionId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM sessions WHERE id = ?`);
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * Delete sessions older than a given date.
   */
  deleteOldSessions(beforeDate: Date): number {
    const stmt = this.db.prepare(`DELETE FROM sessions WHERE timestamp < ?`);
    const result = stmt.run(beforeDate.toISOString());
    return result.changes;
  }

  /**
   * Get session count.
   */
  getSessionCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM sessions`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Convert DB row to LearningSession.
   */
  private dbSessionToLearningSession(row: DBSession): LearningSession {
    return {
      id: row.id,
      bug: {
        code: row.bug_code,
        language: row.bug_language,
        errorMessage: row.bug_error_message ?? undefined,
        lineNumber: row.bug_line_number ?? undefined,
        fileName: row.bug_file_name ?? undefined,
      },
      bugType: row.bug_type,
      hintsGiven: JSON.parse(row.hints_given),
      solved: row.solved === 1,
      gaveUp: row.gave_up === 1,
      hintsNeeded: row.hints_needed,
      timeSpent: row.time_spent,
      timestamp: new Date(row.timestamp),
    };
  }

  // ===========================================================================
  // Key-Value Storage (Settings)
  // ===========================================================================

  /**
   * Save a setting.
   */
  saveSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO key_value (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  /**
   * Get a setting.
   */
  getSetting(key: string): string | null {
    const stmt = this.db.prepare(`SELECT value FROM key_value WHERE key = ?`);
    const row = stmt.get(key) as DBKeyValue | null;
    return row?.value ?? null;
  }

  /**
   * Delete a setting.
   */
  deleteSetting(key: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM key_value WHERE key = ?`);
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * Save config object.
   */
  saveConfig(config: Partial<DebugDuckConfig>): void {
    this.saveSetting("config", JSON.stringify(config));
  }

  /**
   * Get config object.
   */
  getConfig(): Partial<DebugDuckConfig> | null {
    const data = this.getSetting("config");
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // StorageAdapter Implementation (for SessionHistory compatibility)
  // ===========================================================================

  /**
   * Read data from key-value store.
   */
  async read(path: string): Promise<string | null> {
    return this.getSetting(`file:${path}`);
  }

  /**
   * Write data to key-value store.
   */
  async write(path: string, data: string): Promise<void> {
    this.saveSetting(`file:${path}`, data);
  }

  /**
   * Check if a path exists (file or directory with children).
   */
  async exists(path: string): Promise<boolean> {
    // Check if exact file exists
    if (this.getSetting(`file:${path}`) !== null) {
      return true;
    }

    // Check if any files exist under this path (directory check)
    const prefix = `file:${path.endsWith("/") ? path : `${path}/`}`;
    const stmt = this.db.prepare(
      `SELECT 1 FROM key_value WHERE key LIKE ? LIMIT 1`,
    );
    const row = stmt.get(`${prefix}%`);
    return row !== null;
  }

  /**
   * List "files" under a directory prefix.
   */
  async list(dir: string): Promise<string[]> {
    const prefix = `file:${dir.endsWith("/") ? dir : `${dir}/`}`;
    const stmt = this.db.prepare(`SELECT key FROM key_value WHERE key LIKE ?`);
    const rows = stmt.all(`${prefix}%`) as { key: string }[];

    return rows
      .map((row) => {
        const fullPath = row.key.replace("file:", "");
        const relativePath = fullPath.slice(dir.length + 1);
        // Only return direct children
        if (!relativePath.includes("/")) {
          return relativePath;
        }
        return null;
      })
      .filter((f): f is string => f !== null)
      .sort();
  }

  /**
   * Delete a "file".
   */
  async delete(path: string): Promise<void> {
    this.deleteSetting(`file:${path}`);
  }

  /**
   * Create a "directory" (no-op for key-value store).
   */
  async mkdir(_dir: string): Promise<void> {
    // No-op - directories don't need to be created in key-value store
  }

  // ===========================================================================
  // Database Management
  // ===========================================================================

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Clear all data (for testing).
   */
  clearAll(): void {
    this.db.run(`DELETE FROM profiles`);
    this.db.run(`DELETE FROM sessions`);
    this.db.run(`DELETE FROM patterns`);
    this.db.run(`DELETE FROM key_value`);
  }

  /**
   * Get database statistics.
   */
  getStats(): {
    profileCount: number;
    sessionCount: number;
    patternCount: number;
    settingCount: number;
  } {
    const profiles = (
      this.db.prepare(`SELECT COUNT(*) as c FROM profiles`).get() as {
        c: number;
      }
    ).c;
    const sessions = (
      this.db.prepare(`SELECT COUNT(*) as c FROM sessions`).get() as {
        c: number;
      }
    ).c;
    const patterns = (
      this.db.prepare(`SELECT COUNT(*) as c FROM patterns`).get() as {
        c: number;
      }
    ).c;
    const settings = (
      this.db.prepare(`SELECT COUNT(*) as c FROM key_value`).get() as {
        c: number;
      }
    ).c;

    return {
      profileCount: profiles,
      sessionCount: sessions,
      patternCount: patterns,
      settingCount: settings,
    };
  }

  /**
   * Vacuum the database to reclaim space.
   */
  vacuum(): void {
    this.db.run(`VACUUM`);
  }

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return this.dbPath;
  }
}
