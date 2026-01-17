/**
 * FileStorageAdapter - JSON File-based Storage
 *
 * Implements StorageAdapter using the filesystem with Bun.file().
 * Stores data as human-readable JSON files in the `.debugduck/` folder.
 *
 * File Structure:
 * ```
 * .debugduck/
 * ├── profile.json          # User learning profile
 * ├── config.json           # Extension settings
 * └── sessions/
 *     ├── 2025-01-15.json   # Sessions by date
 *     ├── 2025-01-16.json
 *     └── 2025-01-17.json
 * ```
 *
 * @module storage/fileStorage
 */

import { mkdir, readdir, unlink, exists } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { StorageAdapter } from './sessionHistory';
import type {
  LearningProfile,
  LearningSession,
  BugPattern,
  DebugDuckConfig,
} from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for FileStorageAdapter
 */
export interface FileStorageOptions {
  /** Base directory for storage (default: '.debugduck') */
  baseDir?: string;
}

/**
 * Serialized profile for JSON storage
 */
interface SerializedProfile {
  userId: string;
  totalBugs: number;
  bugsSolved: number;
  bugsGaveUp: number;
  averageHintsPerBug: number;
  patterns: Record<string, SerializedPattern>;
  strengths: string[];
  weaknesses: string[];
  streak: number;
  lastActive: string;
  createdAt: string;
}

/**
 * Serialized pattern for JSON storage
 */
interface SerializedPattern {
  type: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  averageHintsNeeded: number;
  improving: boolean;
  contexts: string[];
}

/**
 * Serialized session for JSON storage
 */
interface SerializedSession {
  id: string;
  bug: {
    code: string;
    language: string;
    errorMessage?: string;
    lineNumber?: number;
    fileName?: string;
  };
  bugType: string;
  hintsGiven: Array<{
    level: number;
    hint: string;
    type: string;
  }>;
  solved: boolean;
  gaveUp: boolean;
  hintsNeeded: number;
  timeSpent: number;
  timestamp: string;
}

// =============================================================================
// FileStorageAdapter Class
// =============================================================================

/**
 * JSON file-based storage adapter.
 *
 * Usage:
 * ```typescript
 * const storage = new FileStorageAdapter({ baseDir: '.debugduck' });
 *
 * // Use with SessionHistory
 * const history = new SessionHistory(storage);
 *
 * // Direct file operations
 * await storage.write('config.json', JSON.stringify(config));
 * const data = await storage.read('config.json');
 * ```
 */
export class FileStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor(options?: FileStorageOptions) {
    this.baseDir = options?.baseDir ?? '.debugduck';
  }

  // ===========================================================================
  // StorageAdapter Interface
  // ===========================================================================

  /**
   * Read a file's contents.
   */
  async read(path: string): Promise<string | null> {
    const fullPath = this.resolvePath(path);

    try {
      const file = Bun.file(fullPath);
      if (!(await file.exists())) {
        return null;
      }
      return await file.text();
    } catch {
      return null;
    }
  }

  /**
   * Write data to a file.
   */
  async write(path: string, data: string): Promise<void> {
    const fullPath = this.resolvePath(path);

    // Ensure directory exists
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });

    // Write file
    await Bun.write(fullPath, data);
  }

  /**
   * Check if a path exists (file or directory).
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);

    try {
      return await exists(fullPath);
    } catch {
      return false;
    }
  }

  /**
   * List files in a directory.
   */
  async list(dir: string): Promise<string[]> {
    const fullPath = this.resolvePath(dir);

    try {
      if (!(await exists(fullPath))) {
        return [];
      }

      const entries = await readdir(fullPath);
      return entries.sort();
    } catch {
      return [];
    }
  }

  /**
   * Delete a file.
   */
  async delete(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);

    try {
      await unlink(fullPath);
    } catch {
      // File might not exist, that's okay
    }
  }

  /**
   * Create a directory.
   */
  async mkdir(dir: string): Promise<void> {
    const fullPath = this.resolvePath(dir);
    await mkdir(fullPath, { recursive: true });
  }

  // ===========================================================================
  // Profile Operations
  // ===========================================================================

  /**
   * Save user profile to profile.json.
   */
  async saveProfile(profile: LearningProfile): Promise<void> {
    const serialized = this.serializeProfile(profile);
    await this.write('profile.json', JSON.stringify(serialized, null, 2));
  }

  /**
   * Load user profile from profile.json.
   */
  async getProfile(): Promise<LearningProfile | null> {
    const data = await this.read('profile.json');
    if (!data) return null;

    try {
      const serialized: SerializedProfile = JSON.parse(data);
      return this.deserializeProfile(serialized);
    } catch {
      return null;
    }
  }

  /**
   * Get or create a default profile.
   */
  async getOrCreateProfile(userId: string): Promise<LearningProfile> {
    const existing = await this.getProfile();
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

    await this.saveProfile(newProfile);
    return newProfile;
  }

  /**
   * Delete user profile.
   */
  async deleteProfile(): Promise<void> {
    await this.delete('profile.json');
  }

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  /**
   * Save a session to the appropriate date file.
   */
  async saveSession(session: LearningSession): Promise<void> {
    const dateKey = this.getDateKey(session.timestamp);
    const filePath = `sessions/${dateKey}.json`;

    // Load existing sessions for this date
    let sessions = await this.loadSessionsForDate(dateKey);

    // Update or add session
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }

    // Write back
    const serialized = sessions.map((s) => this.serializeSession(s));
    await this.write(filePath, JSON.stringify(serialized, null, 2));
  }

  /**
   * Save multiple sessions.
   */
  async saveSessions(sessions: LearningSession[]): Promise<void> {
    for (const session of sessions) {
      await this.saveSession(session);
    }
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<LearningSession | null> {
    const dateKeys = await this.getAllDateKeys();

    for (const dateKey of dateKeys) {
      const sessions = await this.loadSessionsForDate(dateKey);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) return session;
    }

    return null;
  }

  /**
   * Get sessions with optional filters.
   */
  async getSessions(options?: {
    bugType?: string;
    solved?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<LearningSession[]> {
    const dateKeys = await this.getDateKeysInRange(
      options?.startDate,
      options?.endDate
    );

    let allSessions: LearningSession[] = [];

    for (const dateKey of dateKeys) {
      const sessions = await this.loadSessionsForDate(dateKey);
      allSessions.push(...sessions);
    }

    // Apply filters
    if (options?.bugType !== undefined) {
      allSessions = allSessions.filter((s) => s.bugType === options.bugType);
    }

    if (options?.solved !== undefined) {
      allSessions = allSessions.filter((s) => s.solved === options.solved);
    }

    // Sort by timestamp descending
    allSessions.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;

    return allSessions.slice(offset, offset + limit);
  }

  /**
   * Get recent sessions.
   */
  async getRecentSessions(limit: number = 10): Promise<LearningSession[]> {
    return this.getSessions({ limit });
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const dateKeys = await this.getAllDateKeys();

    for (const dateKey of dateKeys) {
      const sessions = await this.loadSessionsForDate(dateKey);
      const index = sessions.findIndex((s) => s.id === sessionId);

      if (index >= 0) {
        sessions.splice(index, 1);

        if (sessions.length === 0) {
          await this.delete(`sessions/${dateKey}.json`);
        } else {
          const serialized = sessions.map((s) => this.serializeSession(s));
          await this.write(
            `sessions/${dateKey}.json`,
            JSON.stringify(serialized, null, 2)
          );
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Get total session count.
   */
  async getSessionCount(): Promise<number> {
    const dateKeys = await this.getAllDateKeys();
    let count = 0;

    for (const dateKey of dateKeys) {
      const sessions = await this.loadSessionsForDate(dateKey);
      count += sessions.length;
    }

    return count;
  }

  // ===========================================================================
  // Config Operations
  // ===========================================================================

  /**
   * Save configuration.
   */
  async saveConfig(config: Partial<DebugDuckConfig>): Promise<void> {
    await this.write('config.json', JSON.stringify(config, null, 2));
  }

  /**
   * Load configuration.
   */
  async getConfig(): Promise<Partial<DebugDuckConfig> | null> {
    const data = await this.read('config.json');
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Resolve a relative path to full path.
   */
  private resolvePath(path: string): string {
    // If path already starts with baseDir, don't double it
    if (path.startsWith(this.baseDir)) {
      return path;
    }
    return join(this.baseDir, path);
  }

  /**
   * Get date key from timestamp.
   */
  private getDateKey(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
  }

  /**
   * Load sessions for a specific date.
   */
  private async loadSessionsForDate(dateKey: string): Promise<LearningSession[]> {
    const data = await this.read(`sessions/${dateKey}.json`);
    if (!data) return [];

    try {
      const serialized: SerializedSession[] = JSON.parse(data);
      return serialized.map((s) => this.deserializeSession(s));
    } catch {
      return [];
    }
  }

  /**
   * Get all date keys with stored sessions.
   */
  private async getAllDateKeys(): Promise<string[]> {
    const files = await this.list('sessions');

    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort()
      .reverse();
  }

  /**
   * Get date keys within a range.
   */
  private async getDateKeysInRange(
    startDate?: Date,
    endDate?: Date
  ): Promise<string[]> {
    const allKeys = await this.getAllDateKeys();

    if (!startDate && !endDate) {
      return allKeys;
    }

    const startKey = startDate ? this.getDateKey(startDate) : '0000-00-00';
    const endKey = endDate ? this.getDateKey(endDate) : '9999-12-31';

    return allKeys.filter((key) => key >= startKey && key <= endKey);
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  private serializeProfile(profile: LearningProfile): SerializedProfile {
    const patterns: Record<string, SerializedPattern> = {};

    for (const [type, pattern] of profile.patterns) {
      patterns[type] = {
        type: pattern.type,
        occurrences: pattern.occurrences,
        firstSeen: pattern.firstSeen.toISOString(),
        lastSeen: pattern.lastSeen.toISOString(),
        averageHintsNeeded: pattern.averageHintsNeeded,
        improving: pattern.improving,
        contexts: pattern.contexts,
      };
    }

    return {
      userId: profile.userId,
      totalBugs: profile.totalBugs,
      bugsSolved: profile.bugsSolved,
      bugsGaveUp: profile.bugsGaveUp,
      averageHintsPerBug: profile.averageHintsPerBug,
      patterns,
      strengths: profile.strengths,
      weaknesses: profile.weaknesses,
      streak: profile.streak,
      lastActive: profile.lastActive.toISOString(),
      createdAt: profile.createdAt.toISOString(),
    };
  }

  private deserializeProfile(data: SerializedProfile): LearningProfile {
    const patterns = new Map<string, BugPattern>();

    for (const [type, pattern] of Object.entries(data.patterns)) {
      patterns.set(type, {
        type: pattern.type,
        occurrences: pattern.occurrences,
        firstSeen: new Date(pattern.firstSeen),
        lastSeen: new Date(pattern.lastSeen),
        averageHintsNeeded: pattern.averageHintsNeeded,
        improving: pattern.improving,
        contexts: pattern.contexts,
      });
    }

    return {
      userId: data.userId,
      totalBugs: data.totalBugs,
      bugsSolved: data.bugsSolved,
      bugsGaveUp: data.bugsGaveUp,
      averageHintsPerBug: data.averageHintsPerBug,
      patterns,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      streak: data.streak,
      lastActive: new Date(data.lastActive),
      createdAt: new Date(data.createdAt),
    };
  }

  private serializeSession(session: LearningSession): SerializedSession {
    return {
      id: session.id,
      bug: session.bug,
      bugType: session.bugType,
      hintsGiven: session.hintsGiven,
      solved: session.solved,
      gaveUp: session.gaveUp,
      hintsNeeded: session.hintsNeeded,
      timeSpent: session.timeSpent,
      timestamp:
        session.timestamp instanceof Date
          ? session.timestamp.toISOString()
          : session.timestamp,
    };
  }

  private deserializeSession(data: SerializedSession): LearningSession {
    return {
      id: data.id,
      bug: data.bug,
      bugType: data.bugType,
      hintsGiven: data.hintsGiven as LearningSession['hintsGiven'],
      solved: data.solved,
      gaveUp: data.gaveUp,
      hintsNeeded: data.hintsNeeded,
      timeSpent: data.timeSpent,
      timestamp: new Date(data.timestamp),
    };
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  /**
   * Get the base directory path.
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Clear all stored data.
   */
  async clearAll(): Promise<void> {
    await this.delete('profile.json');
    await this.delete('config.json');

    const dateKeys = await this.getAllDateKeys();
    for (const dateKey of dateKeys) {
      await this.delete(`sessions/${dateKey}.json`);
    }
  }
}
