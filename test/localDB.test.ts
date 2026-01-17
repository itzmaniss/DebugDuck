/**
 * Tests for LocalDB
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LocalDB } from '../src/storage/localDB';
import type { LearningProfile, LearningSession, BugPattern } from '../src/types';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    userId: 'test-user',
    totalBugs: 10,
    bugsSolved: 8,
    bugsGaveUp: 2,
    averageHintsPerBug: 2.5,
    patterns: new Map(),
    strengths: ['async-await'],
    weaknesses: ['null-reference'],
    streak: 5,
    lastActive: new Date('2025-01-17T10:00:00Z'),
    createdAt: new Date('2025-01-01T10:00:00Z'),
    ...overrides,
  };
}

function createMockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  const id = overrides.id ?? `session-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    bug: {
      code: 'const x = arr[i].name;',
      language: 'typescript',
      errorMessage: "Cannot read property 'name' of undefined",
      lineNumber: 10,
      fileName: 'test.ts',
    },
    bugType: 'undefined-access',
    hintsGiven: [
      { level: 1, hint: 'What if i is out of bounds?', type: 'question' as const },
    ],
    solved: true,
    hintsNeeded: 2,
    timeSpent: 120,
    timestamp: new Date('2025-01-17T10:00:00Z'),
    gaveUp: false,
    ...overrides,
  };
}

function createMockPattern(overrides: Partial<BugPattern> = {}): BugPattern {
  return {
    type: 'undefined-access',
    occurrences: 5,
    firstSeen: new Date('2025-01-01T10:00:00Z'),
    lastSeen: new Date('2025-01-17T10:00:00Z'),
    averageHintsNeeded: 2.5,
    improving: true,
    contexts: ['array-access', 'object-property'],
    ...overrides,
  };
}

// =============================================================================
// Profile Tests
// =============================================================================

describe('LocalDB - Profiles', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should save and retrieve a profile', () => {
    const profile = createMockProfile();
    db.saveProfile(profile);

    const retrieved = db.getProfile('test-user');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe('test-user');
    expect(retrieved!.totalBugs).toBe(10);
    expect(retrieved!.bugsSolved).toBe(8);
    expect(retrieved!.streak).toBe(5);
  });

  test('should return null for non-existent profile', () => {
    const profile = db.getProfile('non-existent');
    expect(profile).toBeNull();
  });

  test('should update existing profile', () => {
    const profile = createMockProfile();
    db.saveProfile(profile);

    profile.totalBugs = 20;
    profile.streak = 10;
    db.saveProfile(profile);

    const retrieved = db.getProfile('test-user');
    expect(retrieved!.totalBugs).toBe(20);
    expect(retrieved!.streak).toBe(10);
  });

  test('should preserve arrays (strengths/weaknesses)', () => {
    const profile = createMockProfile({
      strengths: ['async-await', 'error-handling'],
      weaknesses: ['null-reference', 'type-mismatch'],
    });
    db.saveProfile(profile);

    const retrieved = db.getProfile('test-user');
    expect(retrieved!.strengths).toEqual(['async-await', 'error-handling']);
    expect(retrieved!.weaknesses).toEqual(['null-reference', 'type-mismatch']);
  });

  test('should save and retrieve patterns with profile', () => {
    const patterns = new Map<string, BugPattern>();
    patterns.set('undefined-access', createMockPattern());
    patterns.set('async-await', createMockPattern({ type: 'async-await', occurrences: 3 }));

    const profile = createMockProfile({ patterns });
    db.saveProfile(profile);

    const retrieved = db.getProfile('test-user');
    expect(retrieved!.patterns.size).toBe(2);
    expect(retrieved!.patterns.get('undefined-access')!.occurrences).toBe(5);
    expect(retrieved!.patterns.get('async-await')!.occurrences).toBe(3);
  });

  test('should delete profile', () => {
    const profile = createMockProfile();
    db.saveProfile(profile);

    const deleted = db.deleteProfile('test-user');
    expect(deleted).toBe(true);

    const retrieved = db.getProfile('test-user');
    expect(retrieved).toBeNull();
  });

  test('should return false when deleting non-existent profile', () => {
    const deleted = db.deleteProfile('non-existent');
    expect(deleted).toBe(false);
  });

  test('should get or create profile', () => {
    // First call creates the profile
    const created = db.getOrCreateProfile('new-user');
    expect(created.userId).toBe('new-user');
    expect(created.totalBugs).toBe(0);

    // Second call retrieves existing profile
    created.totalBugs = 5;
    db.saveProfile(created);

    const retrieved = db.getOrCreateProfile('new-user');
    expect(retrieved.totalBugs).toBe(5);
  });

  test('should preserve dates correctly', () => {
    const profile = createMockProfile();
    db.saveProfile(profile);

    const retrieved = db.getProfile('test-user');
    expect(retrieved!.lastActive).toBeInstanceOf(Date);
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
    expect(retrieved!.lastActive.toISOString()).toBe('2025-01-17T10:00:00.000Z');
  });
});

// =============================================================================
// Session Tests
// =============================================================================

describe('LocalDB - Sessions', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should save and retrieve a session', () => {
    const session = createMockSession({ id: 'test-session' });
    db.saveSession(session);

    const retrieved = db.getSession('test-session');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('test-session');
    expect(retrieved!.bugType).toBe('undefined-access');
    expect(retrieved!.solved).toBe(true);
  });

  test('should return null for non-existent session', () => {
    const session = db.getSession('non-existent');
    expect(session).toBeNull();
  });

  test('should update existing session', () => {
    const session = createMockSession({ id: 'test-session', hintsNeeded: 2 });
    db.saveSession(session);

    session.hintsNeeded = 4;
    session.solved = false;
    db.saveSession(session);

    const retrieved = db.getSession('test-session');
    expect(retrieved!.hintsNeeded).toBe(4);
    expect(retrieved!.solved).toBe(false);
  });

  test('should save multiple sessions in batch', () => {
    const sessions = [
      createMockSession({ id: 'session-1' }),
      createMockSession({ id: 'session-2' }),
      createMockSession({ id: 'session-3' }),
    ];

    db.saveSessions(sessions);

    expect(db.getSession('session-1')).not.toBeNull();
    expect(db.getSession('session-2')).not.toBeNull();
    expect(db.getSession('session-3')).not.toBeNull();
    expect(db.getSessionCount()).toBe(3);
  });

  test('should get sessions with filters', () => {
    db.saveSessions([
      createMockSession({ id: 's1', bugType: 'undefined-access', solved: true }),
      createMockSession({ id: 's2', bugType: 'async-await', solved: false, gaveUp: true }),
      createMockSession({ id: 's3', bugType: 'undefined-access', solved: true }),
    ]);

    const undefinedAccess = db.getSessions({ bugType: 'undefined-access' });
    expect(undefinedAccess.length).toBe(2);

    const solved = db.getSessions({ solved: true });
    expect(solved.length).toBe(2);

    const unsolved = db.getSessions({ solved: false });
    expect(unsolved.length).toBe(1);
  });

  test('should get sessions with date range', () => {
    db.saveSessions([
      createMockSession({ id: 's1', timestamp: new Date('2025-01-15T10:00:00Z') }),
      createMockSession({ id: 's2', timestamp: new Date('2025-01-16T10:00:00Z') }),
      createMockSession({ id: 's3', timestamp: new Date('2025-01-17T10:00:00Z') }),
    ]);

    const filtered = db.getSessions({
      startDate: new Date('2025-01-16T00:00:00Z'),
      endDate: new Date('2025-01-17T23:59:59Z'),
    });

    expect(filtered.length).toBe(2);
  });

  test('should support pagination', () => {
    for (let i = 0; i < 10; i++) {
      db.saveSession(createMockSession({ id: `session-${i}` }));
    }

    const page1 = db.getSessions({ limit: 3, offset: 0 });
    const page2 = db.getSessions({ limit: 3, offset: 3 });

    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
  });

  test('should get recent sessions', () => {
    db.saveSessions([
      createMockSession({ id: 's1', timestamp: new Date('2025-01-15T10:00:00Z') }),
      createMockSession({ id: 's2', timestamp: new Date('2025-01-17T10:00:00Z') }),
      createMockSession({ id: 's3', timestamp: new Date('2025-01-16T10:00:00Z') }),
    ]);

    const recent = db.getRecentSessions(2);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe('s2'); // Most recent first
  });

  test('should delete session', () => {
    db.saveSession(createMockSession({ id: 'to-delete' }));

    const deleted = db.deleteSession('to-delete');
    expect(deleted).toBe(true);
    expect(db.getSession('to-delete')).toBeNull();
  });

  test('should delete old sessions', () => {
    db.saveSessions([
      createMockSession({ id: 's1', timestamp: new Date('2025-01-01T10:00:00Z') }),
      createMockSession({ id: 's2', timestamp: new Date('2025-01-10T10:00:00Z') }),
      createMockSession({ id: 's3', timestamp: new Date('2025-01-17T10:00:00Z') }),
    ]);

    const deleted = db.deleteOldSessions(new Date('2025-01-15T00:00:00Z'));
    expect(deleted).toBe(2);
    expect(db.getSessionCount()).toBe(1);
  });

  test('should preserve bug details', () => {
    const session = createMockSession({
      id: 'test-session',
      bug: {
        code: 'const x = y.z;',
        language: 'typescript',
        errorMessage: 'Error message',
        lineNumber: 42,
        fileName: 'app.ts',
      },
    });
    db.saveSession(session);

    const retrieved = db.getSession('test-session');
    expect(retrieved!.bug.code).toBe('const x = y.z;');
    expect(retrieved!.bug.language).toBe('typescript');
    expect(retrieved!.bug.errorMessage).toBe('Error message');
    expect(retrieved!.bug.lineNumber).toBe(42);
    expect(retrieved!.bug.fileName).toBe('app.ts');
  });

  test('should handle optional bug fields', () => {
    const session = createMockSession({
      id: 'test-session',
      bug: {
        code: 'x = 1',
        language: 'python',
        // No errorMessage, lineNumber, or fileName
      },
    });
    db.saveSession(session);

    const retrieved = db.getSession('test-session');
    expect(retrieved!.bug.errorMessage).toBeUndefined();
    expect(retrieved!.bug.lineNumber).toBeUndefined();
    expect(retrieved!.bug.fileName).toBeUndefined();
  });

  test('should preserve hints array', () => {
    const session = createMockSession({
      id: 'test-session',
      hintsGiven: [
        { level: 1, hint: 'Hint 1', type: 'question' },
        { level: 2, hint: 'Hint 2', type: 'direction' },
      ],
    });
    db.saveSession(session);

    const retrieved = db.getSession('test-session');
    expect(retrieved!.hintsGiven.length).toBe(2);
    expect(retrieved!.hintsGiven[0].hint).toBe('Hint 1');
    expect(retrieved!.hintsGiven[1].type).toBe('direction');
  });
});

// =============================================================================
// Key-Value / Settings Tests
// =============================================================================

describe('LocalDB - Settings', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should save and retrieve a setting', () => {
    db.saveSetting('theme', 'dark');

    const theme = db.getSetting('theme');
    expect(theme).toBe('dark');
  });

  test('should return null for non-existent setting', () => {
    const value = db.getSetting('non-existent');
    expect(value).toBeNull();
  });

  test('should update existing setting', () => {
    db.saveSetting('theme', 'light');
    db.saveSetting('theme', 'dark');

    const theme = db.getSetting('theme');
    expect(theme).toBe('dark');
  });

  test('should delete setting', () => {
    db.saveSetting('theme', 'dark');

    const deleted = db.deleteSetting('theme');
    expect(deleted).toBe(true);
    expect(db.getSetting('theme')).toBeNull();
  });

  test('should save and retrieve config object', () => {
    const config = {
      maxHints: 5,
      enableRealTimeWarnings: true,
      theme: 'dark' as const,
    };

    db.saveConfig(config);

    const retrieved = db.getConfig();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.maxHints).toBe(5);
    expect(retrieved!.enableRealTimeWarnings).toBe(true);
    expect(retrieved!.theme).toBe('dark');
  });

  test('should return null for missing config', () => {
    const config = db.getConfig();
    expect(config).toBeNull();
  });
});

// =============================================================================
// StorageAdapter Implementation Tests
// =============================================================================

describe('LocalDB - StorageAdapter', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should read and write via StorageAdapter interface', async () => {
    await db.write('test/file.json', '{"foo": "bar"}');

    const data = await db.read('test/file.json');
    expect(data).toBe('{"foo": "bar"}');
  });

  test('should return null for non-existent file', async () => {
    const data = await db.read('non-existent.json');
    expect(data).toBeNull();
  });

  test('should check file existence', async () => {
    expect(await db.exists('test.json')).toBe(false);

    await db.write('test.json', 'data');

    expect(await db.exists('test.json')).toBe(true);
  });

  test('should list files in directory', async () => {
    await db.write('dir/file1.json', '{}');
    await db.write('dir/file2.json', '{}');
    await db.write('dir/file3.txt', '');
    await db.write('other/file.json', '{}');

    const files = await db.list('dir');
    expect(files).toEqual(['file1.json', 'file2.json', 'file3.txt']);
  });

  test('should delete files', async () => {
    await db.write('test.json', 'data');
    expect(await db.exists('test.json')).toBe(true);

    await db.delete('test.json');
    expect(await db.exists('test.json')).toBe(false);
  });

  test('should handle mkdir (no-op)', async () => {
    // Should not throw
    await db.mkdir('some/directory');
  });
});

// =============================================================================
// Database Management Tests
// =============================================================================

describe('LocalDB - Management', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should clear all data', () => {
    db.saveProfile(createMockProfile());
    db.saveSession(createMockSession());
    db.saveSetting('test', 'value');

    db.clearAll();

    expect(db.getProfile('test-user')).toBeNull();
    expect(db.getSessionCount()).toBe(0);
    expect(db.getSetting('test')).toBeNull();
  });

  test('should get database statistics', () => {
    db.saveProfile(createMockProfile());
    db.saveSession(createMockSession({ id: 's1' }));
    db.saveSession(createMockSession({ id: 's2' }));
    db.saveSetting('test', 'value');

    const stats = db.getStats();
    expect(stats.profileCount).toBe(1);
    expect(stats.sessionCount).toBe(2);
    expect(stats.settingCount).toBe(1);
  });

  test('should vacuum database', () => {
    // Just verify it doesn't throw
    db.vacuum();
  });

  test('should return database path', () => {
    const customDb = new LocalDB({ dbPath: 'custom/path.db', inMemory: true });
    expect(customDb.getDbPath()).toBe('custom/path.db');
    customDb.close();
  });
});

// =============================================================================
// Integration with SessionHistory Tests
// =============================================================================

describe('LocalDB - SessionHistory Integration', () => {
  let db: LocalDB;

  beforeEach(() => {
    db = new LocalDB({ inMemory: true });
  });

  afterEach(() => {
    db.close();
  });

  test('should work as StorageAdapter for SessionHistory', async () => {
    // Import SessionHistory
    const { SessionHistory } = await import('../src/storage/sessionHistory');

    // Use LocalDB as the storage adapter
    const history = new SessionHistory(db);

    // Save a session via SessionHistory
    const session = createMockSession({ id: 'test-via-history' });
    await history.saveSession(session);

    // Retrieve via SessionHistory
    const retrieved = await history.getSession('test-via-history');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('test-via-history');
  });

  test('should persist SessionHistory data in database', async () => {
    const { SessionHistory } = await import('../src/storage/sessionHistory');
    const history = new SessionHistory(db);

    await history.saveSession(createMockSession({
      id: 'session-1',
      timestamp: new Date('2025-01-17T10:00:00Z'),
    }));
    await history.saveSession(createMockSession({
      id: 'session-2',
      timestamp: new Date('2025-01-17T14:00:00Z'),
    }));

    const recent = await history.getRecentSessions(10);
    expect(recent.length).toBe(2);
  });
});
