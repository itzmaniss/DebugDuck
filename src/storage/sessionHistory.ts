/**
 * SessionHistory - Manages Persistence and Retrieval of Learning Sessions
 *
 * Stores completed debugging sessions organized by date.
 * Provides querying capabilities for analytics and review.
 *
 * Storage Format:
 * - Sessions are stored in daily JSON files: `.debugduck/sessions/YYYY-MM-DD.json`
 * - Each file contains an array of LearningSession objects
 *
 * Features:
 * 1. Save completed sessions to date-organized files
 * 2. Load sessions by date range or bug type
 * 3. Query recent sessions for dashboard
 * 4. Aggregate statistics across sessions
 * 5. Cleanup old sessions (configurable retention)
 *
 * @module storage/sessionHistory
 */

import type { LearningSession, BugPattern, PatternStat } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for SessionHistory
 */
export interface SessionHistoryOptions {
  /** Base directory for storage (default: '.debugduck') */
  baseDir?: string;
  /** Days to retain sessions (default: 90) */
  retentionDays?: number;
  /** Max sessions per query (default: 100) */
  maxQueryResults?: number;
}

/**
 * Query options for session retrieval
 */
export interface SessionQuery {
  /** Start date (inclusive) */
  startDate?: Date;
  /** End date (inclusive) */
  endDate?: Date;
  /** Filter by bug type */
  bugType?: string;
  /** Filter by solved status */
  solved?: boolean;
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortOrder?: "asc" | "desc";
}

/**
 * Aggregated statistics from sessions
 */
export interface SessionStats {
  totalSessions: number;
  solvedCount: number;
  gaveUpCount: number;
  solveRate: number;
  averageHintsNeeded: number;
  averageTimeSpent: number;
  bugTypeCounts: Record<string, number>;
  dailyCounts: Record<string, number>;
}

/**
 * Storage adapter interface for flexible backend support
 */
export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  delete(path: string): Promise<void>;
  mkdir(dir: string): Promise<void>;
}

/**
 * Serialized session for JSON storage (dates as ISO strings)
 */
interface SerializedSession extends Omit<LearningSession, "timestamp"> {
  timestamp: string;
}

// =============================================================================
// In-Memory Storage Adapter (for testing and VS Code extension)
// =============================================================================

/**
 * Simple in-memory storage adapter.
 * Use this for testing or when VS Code globalState is preferred.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private storage: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  async read(path: string): Promise<string | null> {
    return this.storage.get(path) ?? null;
  }

  async write(path: string, data: string): Promise<void> {
    this.storage.set(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.storage.has(path) || this.directories.has(path);
  }

  async list(dir: string): Promise<string[]> {
    const files: string[] = [];
    const normalizedDir = dir.endsWith("/") ? dir : `${dir}/`;

    for (const key of this.storage.keys()) {
      if (key.startsWith(normalizedDir)) {
        const relativePath = key.slice(normalizedDir.length);
        // Only include direct children (no nested paths)
        if (!relativePath.includes("/")) {
          files.push(relativePath);
        }
      }
    }

    return files.sort();
  }

  async delete(path: string): Promise<void> {
    this.storage.delete(path);
  }

  async mkdir(dir: string): Promise<void> {
    this.directories.add(dir);
  }

  /** Clear all storage (for testing) */
  clear(): void {
    this.storage.clear();
    this.directories.clear();
  }

  /** Get all stored data (for debugging) */
  getAll(): Record<string, string> {
    return Object.fromEntries(this.storage);
  }
}

// =============================================================================
// SessionHistory Class
// =============================================================================

/**
 * Manages persistence and retrieval of learning sessions.
 *
 * Usage:
 * ```typescript
 * const storage = new InMemoryStorageAdapter();
 * const history = new SessionHistory(storage);
 *
 * // Save a session
 * await history.saveSession(completedSession);
 *
 * // Query sessions
 * const recent = await history.getRecentSessions(10);
 * const thisWeek = await history.querySessions({
 *   startDate: new Date('2025-01-10'),
 *   endDate: new Date('2025-01-17'),
 *   bugType: 'undefined-access'
 * });
 *
 * // Get statistics
 * const stats = await history.getStats();
 * ```
 */
export class SessionHistory {
  private storage: StorageAdapter;
  private options: Required<SessionHistoryOptions>;

  /** In-memory cache of loaded sessions by date */
  private cache: Map<string, LearningSession[]> = new Map();

  /** Dirty dates that need to be persisted */
  private dirtyDates: Set<string> = new Set();

  constructor(storage: StorageAdapter, options?: SessionHistoryOptions) {
    this.storage = storage;
    this.options = {
      baseDir: options?.baseDir ?? ".debugduck",
      retentionDays: options?.retentionDays ?? 90,
      maxQueryResults: options?.maxQueryResults ?? 100,
    };
  }

  // ===========================================================================
  // Public API - Save Operations
  // ===========================================================================

  /**
   * Save a completed learning session.
   *
   * @param session - The session to save
   */
  async saveSession(session: LearningSession): Promise<void> {
    // Ensure timestamp is a Date object
    const normalizedSession = {
      ...session,
      timestamp:
        session.timestamp instanceof Date
          ? session.timestamp
          : new Date(session.timestamp),
    };

    const dateKey = this.getDateKey(normalizedSession.timestamp);

    // Load existing sessions for this date
    let sessions = await this.loadDate(dateKey);

    // Check for duplicate (by session ID)
    const existingIndex = sessions.findIndex(
      (s) => s.id === normalizedSession.id,
    );
    if (existingIndex >= 0) {
      // Update existing session
      sessions[existingIndex] = normalizedSession;
    } else {
      // Add new session
      sessions.push(normalizedSession);
    }

    // Update cache and mark dirty
    this.cache.set(dateKey, sessions);
    this.dirtyDates.add(dateKey);

    // Persist immediately
    await this.persistDate(dateKey);
  }

  /**
   * Save multiple sessions in batch.
   *
   * @param sessions - Sessions to save
   */
  async saveSessions(sessions: LearningSession[]): Promise<void> {
    // Group sessions by date
    const byDate = new Map<string, LearningSession[]>();

    for (const session of sessions) {
      const dateKey = this.getDateKey(session.timestamp);
      const existing = byDate.get(dateKey) ?? [];
      existing.push(session);
      byDate.set(dateKey, existing);
    }

    // Save each date
    for (const [dateKey, dateSessions] of byDate) {
      let existing = await this.loadDate(dateKey);

      for (const session of dateSessions) {
        const existingIndex = existing.findIndex((s) => s.id === session.id);
        if (existingIndex >= 0) {
          existing[existingIndex] = session;
        } else {
          existing.push(session);
        }
      }

      this.cache.set(dateKey, existing);
      this.dirtyDates.add(dateKey);
    }

    // Persist all dirty dates
    await this.flush();
  }

  /**
   * Flush all pending changes to storage.
   */
  async flush(): Promise<void> {
    for (const dateKey of this.dirtyDates) {
      await this.persistDate(dateKey);
    }
    this.dirtyDates.clear();
  }

  // ===========================================================================
  // Public API - Query Operations
  // ===========================================================================

  /**
   * Get recent sessions (most recent first).
   *
   * @param limit - Maximum number of sessions to return
   * @returns Array of recent sessions
   */
  async getRecentSessions(limit: number = 10): Promise<LearningSession[]> {
    const sessions = await this.querySessions({
      limit,
      sortOrder: "desc",
    });
    return sessions;
  }

  /**
   * Query sessions with filters.
   *
   * @param query - Query options
   * @returns Matching sessions
   */
  async querySessions(query: SessionQuery = {}): Promise<LearningSession[]> {
    const {
      startDate,
      endDate,
      bugType,
      solved,
      limit = this.options.maxQueryResults,
      offset = 0,
      sortOrder = "desc",
    } = query;

    // Get date range to query
    const dateKeys = await this.getDateKeysInRange(startDate, endDate);

    // Collect all sessions from the date range
    let allSessions: LearningSession[] = [];

    for (const dateKey of dateKeys) {
      const sessions = await this.loadDate(dateKey);
      allSessions.push(...sessions);
    }

    // Apply filters
    if (bugType !== undefined) {
      allSessions = allSessions.filter((s) => s.bugType === bugType);
    }

    if (solved !== undefined) {
      allSessions = allSessions.filter((s) => s.solved === solved);
    }

    // Sort
    allSessions.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });

    // Apply pagination
    return allSessions.slice(offset, offset + limit);
  }

  /**
   * Get a specific session by ID.
   *
   * @param sessionId - Session ID to find
   * @returns The session if found, null otherwise
   */
  async getSession(sessionId: string): Promise<LearningSession | null> {
    // Search through all dates (inefficient, but sessions have unique IDs)
    const dateKeys = await this.getAllDateKeys();

    for (const dateKey of dateKeys) {
      const sessions = await this.loadDate(dateKey);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        return session;
      }
    }

    return null;
  }

  /**
   * Get sessions for a specific date.
   *
   * @param date - The date to get sessions for
   * @returns Sessions from that date
   */
  async getSessionsForDate(date: Date): Promise<LearningSession[]> {
    const dateKey = this.getDateKey(date);
    return this.loadDate(dateKey);
  }

  /**
   * Get all sessions for a specific bug type.
   *
   * @param bugType - The bug type to filter by
   * @param limit - Maximum results
   * @returns Sessions matching the bug type
   */
  async getSessionsByBugType(
    bugType: string,
    limit: number = 50,
  ): Promise<LearningSession[]> {
    return this.querySessions({ bugType, limit });
  }

  // ===========================================================================
  // Public API - Statistics
  // ===========================================================================

  /**
   * Get aggregated statistics from all sessions.
   *
   * @param query - Optional query to filter sessions
   * @returns Aggregated statistics
   */
  async getStats(query?: SessionQuery): Promise<SessionStats> {
    const sessions = await this.querySessions({
      ...query,
      limit: 10000, // Get all for stats
    });

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        solvedCount: 0,
        gaveUpCount: 0,
        solveRate: 0,
        averageHintsNeeded: 0,
        averageTimeSpent: 0,
        bugTypeCounts: {},
        dailyCounts: {},
      };
    }

    const solvedSessions = sessions.filter((s) => s.solved);
    const gaveUpSessions = sessions.filter((s) => s.gaveUp);

    // Calculate averages
    const totalHints = sessions.reduce((sum, s) => sum + s.hintsNeeded, 0);
    const totalTime = sessions.reduce((sum, s) => sum + s.timeSpent, 0);

    // Bug type counts
    const bugTypeCounts: Record<string, number> = {};
    for (const session of sessions) {
      bugTypeCounts[session.bugType] =
        (bugTypeCounts[session.bugType] ?? 0) + 1;
    }

    // Daily counts
    const dailyCounts: Record<string, number> = {};
    for (const session of sessions) {
      const dateKey = this.getDateKey(session.timestamp);
      dailyCounts[dateKey] = (dailyCounts[dateKey] ?? 0) + 1;
    }

    return {
      totalSessions: sessions.length,
      solvedCount: solvedSessions.length,
      gaveUpCount: gaveUpSessions.length,
      solveRate: solvedSessions.length / sessions.length,
      averageHintsNeeded: totalHints / sessions.length,
      averageTimeSpent: totalTime / sessions.length,
      bugTypeCounts,
      dailyCounts,
    };
  }

  /**
   * Get pattern statistics from sessions.
   *
   * @param minOccurrences - Minimum occurrences to include
   * @returns Array of pattern statistics
   */
  async getPatternStats(minOccurrences: number = 2): Promise<PatternStat[]> {
    const sessions = await this.querySessions({ limit: 10000 });

    // Group by bug type
    const byType = new Map<string, LearningSession[]>();
    for (const session of sessions) {
      const existing = byType.get(session.bugType) ?? [];
      existing.push(session);
      byType.set(session.bugType, existing);
    }

    // Calculate stats for each type
    const stats: PatternStat[] = [];

    for (const [type, typeSessions] of byType) {
      if (typeSessions.length < minOccurrences) continue;

      // Sort by timestamp to determine trend
      typeSessions.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const totalHints = typeSessions.reduce(
        (sum, s) => sum + s.hintsNeeded,
        0,
      );
      const averageHints = totalHints / typeSessions.length;

      // Calculate trend (compare first half to second half)
      const midpoint = Math.floor(typeSessions.length / 2);
      const firstHalf = typeSessions.slice(0, midpoint);
      const secondHalf = typeSessions.slice(midpoint);

      let trend: "improving" | "stable" | "declining" = "stable";

      if (firstHalf.length > 0 && secondHalf.length > 0) {
        const firstAvg =
          firstHalf.reduce((sum, s) => sum + s.hintsNeeded, 0) /
          firstHalf.length;
        const secondAvg =
          secondHalf.reduce((sum, s) => sum + s.hintsNeeded, 0) /
          secondHalf.length;

        const diff = firstAvg - secondAvg;
        if (diff > 0.5) {
          trend = "improving"; // Fewer hints needed now
        } else if (diff < -0.5) {
          trend = "declining"; // More hints needed now
        }
      }

      stats.push({
        type,
        count: typeSessions.length,
        averageHints,
        trend,
      });
    }

    // Sort by count descending
    stats.sort((a, b) => b.count - a.count);

    return stats;
  }

  /**
   * Build bug patterns from session history.
   * Useful for initializing PatternTracker from historical data.
   *
   * @returns Map of bug type to BugPattern
   */
  async buildPatterns(): Promise<Map<string, BugPattern>> {
    const sessions = await this.querySessions({ limit: 10000 });
    const patterns = new Map<string, BugPattern>();

    for (const session of sessions) {
      const existing = patterns.get(session.bugType);
      const sessionDate = new Date(session.timestamp);

      if (existing) {
        // Update existing pattern
        existing.occurrences++;
        if (sessionDate < existing.firstSeen) {
          existing.firstSeen = sessionDate;
        }
        if (sessionDate > existing.lastSeen) {
          existing.lastSeen = sessionDate;
        }
        // Recalculate average
        const total = existing.averageHintsNeeded * (existing.occurrences - 1);
        existing.averageHintsNeeded =
          (total + session.hintsNeeded) / existing.occurrences;
      } else {
        // Create new pattern
        patterns.set(session.bugType, {
          type: session.bugType,
          occurrences: 1,
          firstSeen: sessionDate,
          lastSeen: sessionDate,
          averageHintsNeeded: session.hintsNeeded,
          improving: false,
          contexts: [],
        });
      }
    }

    // Calculate improving status for each pattern
    for (const [type, pattern] of patterns) {
      if (pattern.occurrences >= 3) {
        const stats = await this.getPatternStats(1);
        const stat = stats.find((s) => s.type === type);
        if (stat) {
          pattern.improving = stat.trend === "improving";
        }
      }
    }

    return patterns;
  }

  // ===========================================================================
  // Public API - Maintenance
  // ===========================================================================

  /**
   * Delete a specific session.
   *
   * @param sessionId - Session ID to delete
   * @returns true if session was found and deleted
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const dateKeys = await this.getAllDateKeys();

    for (const dateKey of dateKeys) {
      const sessions = await this.loadDate(dateKey);
      const index = sessions.findIndex((s) => s.id === sessionId);

      if (index >= 0) {
        sessions.splice(index, 1);
        this.cache.set(dateKey, sessions);
        await this.persistDate(dateKey);
        return true;
      }
    }

    return false;
  }

  /**
   * Clean up old sessions beyond retention period.
   *
   * @returns Number of sessions deleted
   */
  async cleanup(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);
    const cutoffKey = this.getDateKey(cutoffDate);

    const dateKeys = await this.getAllDateKeys();
    let deletedCount = 0;

    for (const dateKey of dateKeys) {
      if (dateKey < cutoffKey) {
        const sessions = await this.loadDate(dateKey);
        deletedCount += sessions.length;

        // Delete the file
        const filePath = this.getFilePath(dateKey);
        await this.storage.delete(filePath);

        // Clear from cache
        this.cache.delete(dateKey);
      }
    }

    return deletedCount;
  }

  /**
   * Clear all session history.
   */
  async clearAll(): Promise<void> {
    const dateKeys = await this.getAllDateKeys();

    for (const dateKey of dateKeys) {
      const filePath = this.getFilePath(dateKey);
      await this.storage.delete(filePath);
    }

    this.cache.clear();
    this.dirtyDates.clear();
  }

  /**
   * Get the total number of stored sessions.
   */
  async getTotalCount(): Promise<number> {
    const dateKeys = await this.getAllDateKeys();
    let total = 0;

    for (const dateKey of dateKeys) {
      const sessions = await this.loadDate(dateKey);
      total += sessions.length;
    }

    return total;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get date key (YYYY-MM-DD) from a Date object.
   */
  private getDateKey(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().split("T")[0];
  }

  /**
   * Get file path for a date key.
   */
  private getFilePath(dateKey: string): string {
    return `${this.options.baseDir}/sessions/${dateKey}.json`;
  }

  /**
   * Load sessions for a specific date.
   */
  private async loadDate(dateKey: string): Promise<LearningSession[]> {
    // Check cache first
    if (this.cache.has(dateKey)) {
      return this.cache.get(dateKey)!;
    }

    // Load from storage
    const filePath = this.getFilePath(dateKey);
    const data = await this.storage.read(filePath);

    if (!data) {
      this.cache.set(dateKey, []);
      return [];
    }

    try {
      const serialized: SerializedSession[] = JSON.parse(data);
      const sessions = serialized.map((s) => this.deserializeSession(s));
      this.cache.set(dateKey, sessions);
      return sessions;
    } catch {
      // Corrupted data, return empty
      this.cache.set(dateKey, []);
      return [];
    }
  }

  /**
   * Persist sessions for a specific date to storage.
   */
  private async persistDate(dateKey: string): Promise<void> {
    const sessions = this.cache.get(dateKey);

    if (!sessions || sessions.length === 0) {
      // Delete empty files
      const filePath = this.getFilePath(dateKey);
      await this.storage.delete(filePath);
      this.dirtyDates.delete(dateKey);
      return;
    }

    // Ensure directory exists
    const sessionsDir = `${this.options.baseDir}/sessions`;
    await this.storage.mkdir(sessionsDir);

    // Serialize and write
    const serialized = sessions.map((s) => this.serializeSession(s));
    const filePath = this.getFilePath(dateKey);
    await this.storage.write(filePath, JSON.stringify(serialized, null, 2));

    this.dirtyDates.delete(dateKey);
  }

  /**
   * Get all date keys that have stored sessions.
   */
  private async getAllDateKeys(): Promise<string[]> {
    const sessionsDir = `${this.options.baseDir}/sessions`;

    if (!(await this.storage.exists(sessionsDir))) {
      return [];
    }

    const files = await this.storage.list(sessionsDir);

    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse(); // Most recent first
  }

  /**
   * Get date keys within a range.
   */
  private async getDateKeysInRange(
    startDate?: Date,
    endDate?: Date,
  ): Promise<string[]> {
    const allKeys = await this.getAllDateKeys();

    if (!startDate && !endDate) {
      return allKeys;
    }

    const startKey = startDate ? this.getDateKey(startDate) : "0000-00-00";
    const endKey = endDate ? this.getDateKey(endDate) : "9999-12-31";

    return allKeys.filter((key) => key >= startKey && key <= endKey);
  }

  /**
   * Serialize a session for JSON storage.
   */
  private serializeSession(session: LearningSession): SerializedSession {
    return {
      ...session,
      timestamp:
        session.timestamp instanceof Date
          ? session.timestamp.toISOString()
          : session.timestamp,
    };
  }

  /**
   * Deserialize a session from JSON storage.
   */
  private deserializeSession(data: SerializedSession): LearningSession {
    return {
      ...data,
      timestamp: new Date(data.timestamp),
    };
  }
}
