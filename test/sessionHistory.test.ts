/**
 * Tests for SessionHistory
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  SessionHistory,
  InMemoryStorageAdapter,
} from "../src/storage/sessionHistory";
import type { LearningSession, HintLevel } from "../src/types";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockSession(
  overrides: Partial<LearningSession> = {},
): LearningSession {
  const id =
    overrides.id ?? `session-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    bug: {
      code: "const x = arr[i].name;",
      language: "typescript",
      errorMessage: "Cannot read property 'name' of undefined",
    },
    bugType: "undefined-access",
    hintsGiven: [
      {
        level: 1,
        hint: "What if i is out of bounds?",
        type: "question" as const,
      },
    ],
    solved: true,
    hintsNeeded: 2,
    timeSpent: 120,
    timestamp: new Date(),
    gaveUp: false,
    ...overrides,
  };
}

function createSessionWithDate(
  date: Date,
  overrides: Partial<LearningSession> = {},
): LearningSession {
  return createMockSession({
    timestamp: date,
    ...overrides,
  });
}

// =============================================================================
// InMemoryStorageAdapter Tests
// =============================================================================

describe("InMemoryStorageAdapter", () => {
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  test("should read and write data", async () => {
    await storage.write("test/file.json", '{"foo": "bar"}');
    const data = await storage.read("test/file.json");
    expect(data).toBe('{"foo": "bar"}');
  });

  test("should return null for non-existent files", async () => {
    const data = await storage.read("non-existent.json");
    expect(data).toBeNull();
  });

  test("should check file existence", async () => {
    expect(await storage.exists("test.json")).toBe(false);
    await storage.write("test.json", "data");
    expect(await storage.exists("test.json")).toBe(true);
  });

  test("should list files in directory", async () => {
    await storage.write("dir/file1.json", "{}");
    await storage.write("dir/file2.json", "{}");
    await storage.write("dir/file3.txt", "");
    await storage.write("other/file.json", "{}");

    const files = await storage.list("dir");
    expect(files).toEqual(["file1.json", "file2.json", "file3.txt"]);
  });

  test("should delete files", async () => {
    await storage.write("test.json", "data");
    expect(await storage.exists("test.json")).toBe(true);

    await storage.delete("test.json");
    expect(await storage.exists("test.json")).toBe(false);
  });

  test("should create directories", async () => {
    await storage.mkdir("test/dir");
    expect(await storage.exists("test/dir")).toBe(true);
  });

  test("should clear all data", async () => {
    await storage.write("file1.json", "{}");
    await storage.write("file2.json", "{}");
    storage.clear();

    expect(await storage.read("file1.json")).toBeNull();
    expect(await storage.read("file2.json")).toBeNull();
  });
});

// =============================================================================
// SessionHistory - Save Operations Tests
// =============================================================================

describe("SessionHistory - Save Operations", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage);
  });

  test("should save a session", async () => {
    const session = createMockSession();
    await history.saveSession(session);

    const retrieved = await history.getSession(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(session.id);
    expect(retrieved!.bugType).toBe("undefined-access");
  });

  test("should update existing session", async () => {
    const session = createMockSession({ hintsNeeded: 2 });
    await history.saveSession(session);

    // Update the session
    session.hintsNeeded = 4;
    session.solved = false;
    await history.saveSession(session);

    const retrieved = await history.getSession(session.id);
    expect(retrieved!.hintsNeeded).toBe(4);
    expect(retrieved!.solved).toBe(false);

    // Should still be only one session
    const total = await history.getTotalCount();
    expect(total).toBe(1);
  });

  test("should save multiple sessions in batch", async () => {
    const sessions = [
      createMockSession({ id: "session-1" }),
      createMockSession({ id: "session-2" }),
      createMockSession({ id: "session-3" }),
    ];

    await history.saveSessions(sessions);

    const total = await history.getTotalCount();
    expect(total).toBe(3);
  });

  test("should organize sessions by date", async () => {
    const today = new Date("2025-01-17");
    const yesterday = new Date("2025-01-16");

    await history.saveSession(createSessionWithDate(today, { id: "today-1" }));
    await history.saveSession(createSessionWithDate(today, { id: "today-2" }));
    await history.saveSession(
      createSessionWithDate(yesterday, { id: "yesterday-1" }),
    );

    const todaySessions = await history.getSessionsForDate(today);
    expect(todaySessions.length).toBe(2);

    const yesterdaySessions = await history.getSessionsForDate(yesterday);
    expect(yesterdaySessions.length).toBe(1);
  });

  test("should persist data to storage", async () => {
    const session = createSessionWithDate(new Date("2025-01-17"));
    await history.saveSession(session);

    // Verify data was written to storage
    const data = await storage.read(".debugduck/sessions/2025-01-17.json");
    expect(data).not.toBeNull();

    const parsed = JSON.parse(data!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe(session.id);
  });
});

// =============================================================================
// SessionHistory - Query Operations Tests
// =============================================================================

describe("SessionHistory - Query Operations", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage);

    // Seed with test data (use specific times for deterministic ordering)
    const sessions = [
      createSessionWithDate(new Date("2025-01-15T10:00:00Z"), {
        id: "old-1",
        bugType: "undefined-access",
        solved: true,
        hintsNeeded: 3,
      }),
      createSessionWithDate(new Date("2025-01-16T10:00:00Z"), {
        id: "mid-1",
        bugType: "async-await",
        solved: false,
        gaveUp: true,
        hintsNeeded: 4,
      }),
      createSessionWithDate(new Date("2025-01-17T10:00:00Z"), {
        id: "new-1",
        bugType: "undefined-access",
        solved: true,
        hintsNeeded: 1,
      }),
      createSessionWithDate(new Date("2025-01-17T14:00:00Z"), {
        id: "new-2",
        bugType: "null-reference",
        solved: true,
        hintsNeeded: 2,
      }),
    ];

    await history.saveSessions(sessions);
  });

  test("should get recent sessions", async () => {
    const recent = await history.getRecentSessions(3);

    expect(recent.length).toBe(3);
    // Most recent first (new-2 at 14:00, new-1 at 10:00)
    expect(recent[0].id).toBe("new-2");
    expect(recent[1].id).toBe("new-1");
  });

  test("should query by date range", async () => {
    const sessions = await history.querySessions({
      startDate: new Date("2025-01-16"),
      endDate: new Date("2025-01-17"),
    });

    expect(sessions.length).toBe(3);
  });

  test("should query by bug type", async () => {
    const sessions = await history.querySessions({
      bugType: "undefined-access",
    });

    expect(sessions.length).toBe(2);
    expect(sessions.every((s) => s.bugType === "undefined-access")).toBe(true);
  });

  test("should query by solved status", async () => {
    const solved = await history.querySessions({ solved: true });
    expect(solved.length).toBe(3);

    const unsolved = await history.querySessions({ solved: false });
    expect(unsolved.length).toBe(1);
    expect(unsolved[0].id).toBe("mid-1");
  });

  test("should support pagination", async () => {
    const page1 = await history.querySessions({ limit: 2, offset: 0 });
    const page2 = await history.querySessions({ limit: 2, offset: 2 });

    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);

    // Pages should have different sessions
    const page1Ids = page1.map((s) => s.id);
    const page2Ids = page2.map((s) => s.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  test("should support ascending sort order", async () => {
    const sessions = await history.querySessions({ sortOrder: "asc" });

    // Oldest first
    expect(sessions[0].id).toBe("old-1");
  });

  test("should get session by ID", async () => {
    const session = await history.getSession("mid-1");
    expect(session).not.toBeNull();
    expect(session!.bugType).toBe("async-await");
  });

  test("should return null for non-existent session", async () => {
    const session = await history.getSession("non-existent");
    expect(session).toBeNull();
  });

  test("should get sessions by bug type", async () => {
    const sessions = await history.getSessionsByBugType("undefined-access");
    expect(sessions.length).toBe(2);
  });
});

// =============================================================================
// SessionHistory - Statistics Tests
// =============================================================================

describe("SessionHistory - Statistics", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage);

    // Seed with test data
    const sessions = [
      createSessionWithDate(new Date("2025-01-15"), {
        id: "session-1",
        bugType: "undefined-access",
        solved: true,
        hintsNeeded: 3,
        timeSpent: 120,
      }),
      createSessionWithDate(new Date("2025-01-16"), {
        id: "session-2",
        bugType: "undefined-access",
        solved: true,
        hintsNeeded: 2,
        timeSpent: 90,
      }),
      createSessionWithDate(new Date("2025-01-17"), {
        id: "session-3",
        bugType: "undefined-access",
        solved: true,
        hintsNeeded: 1,
        timeSpent: 60,
      }),
      createSessionWithDate(new Date("2025-01-17"), {
        id: "session-4",
        bugType: "async-await",
        solved: false,
        gaveUp: true,
        hintsNeeded: 4,
        timeSpent: 300,
      }),
    ];

    await history.saveSessions(sessions);
  });

  test("should calculate basic statistics", async () => {
    const stats = await history.getStats();

    expect(stats.totalSessions).toBe(4);
    expect(stats.solvedCount).toBe(3);
    expect(stats.gaveUpCount).toBe(1);
    expect(stats.solveRate).toBeCloseTo(0.75);
    expect(stats.averageHintsNeeded).toBeCloseTo(2.5);
    expect(stats.averageTimeSpent).toBeCloseTo(142.5);
  });

  test("should count bug types", async () => {
    const stats = await history.getStats();

    expect(stats.bugTypeCounts["undefined-access"]).toBe(3);
    expect(stats.bugTypeCounts["async-await"]).toBe(1);
  });

  test("should count daily sessions", async () => {
    const stats = await history.getStats();

    expect(stats.dailyCounts["2025-01-15"]).toBe(1);
    expect(stats.dailyCounts["2025-01-16"]).toBe(1);
    expect(stats.dailyCounts["2025-01-17"]).toBe(2);
  });

  test("should return empty stats for no sessions", async () => {
    const emptyHistory = new SessionHistory(new InMemoryStorageAdapter());
    const stats = await emptyHistory.getStats();

    expect(stats.totalSessions).toBe(0);
    expect(stats.solveRate).toBe(0);
  });

  test("should calculate pattern statistics", async () => {
    // Default minOccurrences is 2, so async-await (1 occurrence) is filtered out
    const patterns = await history.getPatternStats();

    expect(patterns.length).toBe(1); // Only undefined-access has 3 occurrences

    const undefinedAccess = patterns.find((p) => p.type === "undefined-access");
    expect(undefinedAccess).not.toBeUndefined();
    expect(undefinedAccess!.count).toBe(3);
    expect(undefinedAccess!.averageHints).toBeCloseTo(2);
    expect(undefinedAccess!.trend).toBe("improving"); // 3 -> 2 -> 1 hints

    // With minOccurrences=1, we get all patterns
    const allPatterns = await history.getPatternStats(1);
    expect(allPatterns.length).toBe(2);
  });

  test("should detect improving trend", async () => {
    const patterns = await history.getPatternStats();
    const undefinedAccess = patterns.find((p) => p.type === "undefined-access");

    // Started with 3 hints, now down to 1
    expect(undefinedAccess!.trend).toBe("improving");
  });

  test("should build bug patterns from history", async () => {
    const patterns = await history.buildPatterns();

    expect(patterns.size).toBe(2);

    const undefinedAccess = patterns.get("undefined-access");
    expect(undefinedAccess).not.toBeUndefined();
    expect(undefinedAccess!.occurrences).toBe(3);
    expect(undefinedAccess!.averageHintsNeeded).toBeCloseTo(2);
  });
});

// =============================================================================
// SessionHistory - Maintenance Tests
// =============================================================================

describe("SessionHistory - Maintenance", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage, { retentionDays: 30 });
  });

  test("should delete a session", async () => {
    const session = createMockSession({ id: "to-delete" });
    await history.saveSession(session);

    expect(await history.getSession("to-delete")).not.toBeNull();

    const deleted = await history.deleteSession("to-delete");
    expect(deleted).toBe(true);
    expect(await history.getSession("to-delete")).toBeNull();
  });

  test("should return false when deleting non-existent session", async () => {
    const deleted = await history.deleteSession("non-existent");
    expect(deleted).toBe(false);
  });

  test("should cleanup old sessions", async () => {
    // Create sessions at different dates
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

    await history.saveSession(createSessionWithDate(oldDate, { id: "old" }));
    await history.saveSession(
      createSessionWithDate(recentDate, { id: "recent" }),
    );

    // Cleanup should remove sessions older than 30 days
    const deletedCount = await history.cleanup();

    expect(deletedCount).toBe(1);
    expect(await history.getSession("old")).toBeNull();
    expect(await history.getSession("recent")).not.toBeNull();
  });

  test("should clear all sessions", async () => {
    await history.saveSession(createMockSession({ id: "session-1" }));
    await history.saveSession(createMockSession({ id: "session-2" }));

    await history.clearAll();

    const total = await history.getTotalCount();
    expect(total).toBe(0);
  });

  test("should get total count", async () => {
    await history.saveSession(createMockSession({ id: "session-1" }));
    await history.saveSession(createMockSession({ id: "session-2" }));
    await history.saveSession(createMockSession({ id: "session-3" }));

    const total = await history.getTotalCount();
    expect(total).toBe(3);
  });
});

// =============================================================================
// SessionHistory - Edge Cases Tests
// =============================================================================

describe("SessionHistory - Edge Cases", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage);
  });

  test("should handle corrupted storage data", async () => {
    // Write corrupted data
    await storage.write(
      ".debugduck/sessions/2025-01-17.json",
      "not valid json",
    );

    // Should not throw, return empty array
    const sessions = await history.getSessionsForDate(new Date("2025-01-17"));
    expect(sessions).toEqual([]);
  });

  test("should handle empty storage", async () => {
    const recent = await history.getRecentSessions();
    expect(recent).toEqual([]);

    const stats = await history.getStats();
    expect(stats.totalSessions).toBe(0);
  });

  test("should handle sessions with string timestamps", async () => {
    const session = createMockSession();
    // Simulate serialized data with string timestamp
    (session as any).timestamp = "2025-01-17T10:30:00.000Z";

    await history.saveSession(session);

    const retrieved = await history.getSession(session.id);
    expect(retrieved!.timestamp).toBeInstanceOf(Date);
  });

  test("should handle custom base directory", async () => {
    const customHistory = new SessionHistory(storage, {
      baseDir: "custom/path",
    });

    const session = createSessionWithDate(new Date("2025-01-17"));
    await customHistory.saveSession(session);

    const data = await storage.read("custom/path/sessions/2025-01-17.json");
    expect(data).not.toBeNull();
  });

  test("should flush pending changes", async () => {
    const session1 = createMockSession({ id: "session-1" });
    const session2 = createMockSession({ id: "session-2" });

    await history.saveSession(session1);
    await history.saveSession(session2);

    await history.flush();

    // Verify both are persisted
    const total = await history.getTotalCount();
    expect(total).toBe(2);
  });

  test("should handle large number of sessions", async () => {
    const sessions: LearningSession[] = [];
    for (let i = 0; i < 100; i++) {
      sessions.push(createMockSession({ id: `session-${i}` }));
    }

    await history.saveSessions(sessions);

    const total = await history.getTotalCount();
    expect(total).toBe(100);

    const recent = await history.getRecentSessions(10);
    expect(recent.length).toBe(10);
  });

  test("should respect maxQueryResults option", async () => {
    const customHistory = new SessionHistory(storage, { maxQueryResults: 5 });

    const sessions: LearningSession[] = [];
    for (let i = 0; i < 20; i++) {
      sessions.push(createMockSession({ id: `session-${i}` }));
    }

    await customHistory.saveSessions(sessions);

    // Default query should be limited to 5
    const results = await customHistory.querySessions();
    expect(results.length).toBe(5);
  });

  test("should delete empty date files", async () => {
    const session = createSessionWithDate(new Date("2025-01-17"), {
      id: "only-one",
    });
    await history.saveSession(session);

    // Verify file exists
    expect(await storage.exists(".debugduck/sessions/2025-01-17.json")).toBe(
      true,
    );

    // Delete the only session
    await history.deleteSession("only-one");

    // File should be deleted (not just emptied)
    const data = await storage.read(".debugduck/sessions/2025-01-17.json");
    expect(data).toBeNull();
  });
});

// =============================================================================
// SessionHistory - Caching Tests
// =============================================================================

describe("SessionHistory - Caching", () => {
  let storage: InMemoryStorageAdapter;
  let history: SessionHistory;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    history = new SessionHistory(storage);
  });

  test("should cache loaded sessions", async () => {
    const session = createSessionWithDate(new Date("2025-01-17"));
    await history.saveSession(session);

    // First load
    await history.getSessionsForDate(new Date("2025-01-17"));

    // Corrupt the storage (shouldn't affect cached data)
    await storage.write(".debugduck/sessions/2025-01-17.json", "corrupted");

    // Second load should use cache
    const sessions = await history.getSessionsForDate(new Date("2025-01-17"));
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(session.id);
  });

  test("should update cache on save", async () => {
    const session1 = createSessionWithDate(new Date("2025-01-17"), {
      id: "session-1",
    });
    await history.saveSession(session1);

    const session2 = createSessionWithDate(new Date("2025-01-17"), {
      id: "session-2",
    });
    await history.saveSession(session2);

    const sessions = await history.getSessionsForDate(new Date("2025-01-17"));
    expect(sessions.length).toBe(2);
  });
});
