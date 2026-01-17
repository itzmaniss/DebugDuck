/**
 * Tests for FileStorageAdapter
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FileStorageAdapter } from '../src/storage/fileStorage';
import { rm } from 'node:fs/promises';
import type { LearningProfile, LearningSession, BugPattern } from '../src/types';

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_DIR = '.debugduck-test';

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

async function cleanupTestDir() {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
}

// =============================================================================
// StorageAdapter Interface Tests
// =============================================================================

describe('FileStorageAdapter - StorageAdapter Interface', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should read and write data', async () => {
    await storage.write('test.json', '{"foo": "bar"}');
    const data = await storage.read('test.json');
    expect(data).toBe('{"foo": "bar"}');
  });

  test('should return null for non-existent file', async () => {
    const data = await storage.read('non-existent.json');
    expect(data).toBeNull();
  });

  test('should check file existence', async () => {
    expect(await storage.exists('test.json')).toBe(false);
    await storage.write('test.json', 'data');
    expect(await storage.exists('test.json')).toBe(true);
  });

  test('should check directory existence', async () => {
    expect(await storage.exists('sessions')).toBe(false);
    await storage.mkdir('sessions');
    expect(await storage.exists('sessions')).toBe(true);
  });

  test('should list files in directory', async () => {
    await storage.write('dir/file1.json', '{}');
    await storage.write('dir/file2.json', '{}');
    await storage.write('dir/file3.txt', '');

    const files = await storage.list('dir');
    expect(files).toEqual(['file1.json', 'file2.json', 'file3.txt']);
  });

  test('should return empty array for non-existent directory', async () => {
    const files = await storage.list('non-existent');
    expect(files).toEqual([]);
  });

  test('should delete files', async () => {
    await storage.write('test.json', 'data');
    expect(await storage.exists('test.json')).toBe(true);

    await storage.delete('test.json');
    expect(await storage.exists('test.json')).toBe(false);
  });

  test('should create directories', async () => {
    await storage.mkdir('nested/dir/path');
    expect(await storage.exists('nested/dir/path')).toBe(true);
  });

  test('should create parent directories when writing', async () => {
    await storage.write('nested/deep/file.json', '{}');
    expect(await storage.exists('nested/deep/file.json')).toBe(true);
  });
});

// =============================================================================
// Profile Tests
// =============================================================================

describe('FileStorageAdapter - Profiles', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should save and retrieve profile', async () => {
    const profile = createMockProfile();
    await storage.saveProfile(profile);

    const retrieved = await storage.getProfile();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe('test-user');
    expect(retrieved!.totalBugs).toBe(10);
    expect(retrieved!.streak).toBe(5);
  });

  test('should return null for non-existent profile', async () => {
    const profile = await storage.getProfile();
    expect(profile).toBeNull();
  });

  test('should preserve patterns in profile', async () => {
    const patterns = new Map<string, BugPattern>();
    patterns.set('undefined-access', createMockPattern());
    patterns.set('async-await', createMockPattern({ type: 'async-await', occurrences: 3 }));

    const profile = createMockProfile({ patterns });
    await storage.saveProfile(profile);

    const retrieved = await storage.getProfile();
    expect(retrieved!.patterns.size).toBe(2);
    expect(retrieved!.patterns.get('undefined-access')!.occurrences).toBe(5);
    expect(retrieved!.patterns.get('async-await')!.occurrences).toBe(3);
  });

  test('should preserve dates in profile', async () => {
    const profile = createMockProfile();
    await storage.saveProfile(profile);

    const retrieved = await storage.getProfile();
    expect(retrieved!.lastActive).toBeInstanceOf(Date);
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
    expect(retrieved!.lastActive.toISOString()).toBe('2025-01-17T10:00:00.000Z');
  });

  test('should get or create profile', async () => {
    const created = await storage.getOrCreateProfile('new-user');
    expect(created.userId).toBe('new-user');
    expect(created.totalBugs).toBe(0);

    // Modify and save
    created.totalBugs = 5;
    await storage.saveProfile(created);

    // Should retrieve existing
    const retrieved = await storage.getOrCreateProfile('new-user');
    expect(retrieved.totalBugs).toBe(5);
  });

  test('should delete profile', async () => {
    await storage.saveProfile(createMockProfile());
    expect(await storage.getProfile()).not.toBeNull();

    await storage.deleteProfile();
    expect(await storage.getProfile()).toBeNull();
  });

  test('should store profile as readable JSON', async () => {
    const profile = createMockProfile();
    await storage.saveProfile(profile);

    const raw = await storage.read('profile.json');
    expect(raw).not.toBeNull();

    // Should be valid, formatted JSON
    const parsed = JSON.parse(raw!);
    expect(parsed.userId).toBe('test-user');
    expect(raw!.includes('\n')).toBe(true); // Pretty-printed
  });
});

// =============================================================================
// Session Tests
// =============================================================================

describe('FileStorageAdapter - Sessions', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should save and retrieve session', async () => {
    const session = createMockSession({ id: 'test-session' });
    await storage.saveSession(session);

    const retrieved = await storage.getSession('test-session');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('test-session');
    expect(retrieved!.bugType).toBe('undefined-access');
  });

  test('should return null for non-existent session', async () => {
    const session = await storage.getSession('non-existent');
    expect(session).toBeNull();
  });

  test('should organize sessions by date', async () => {
    await storage.saveSession(createMockSession({
      id: 's1',
      timestamp: new Date('2025-01-15T10:00:00Z'),
    }));
    await storage.saveSession(createMockSession({
      id: 's2',
      timestamp: new Date('2025-01-17T10:00:00Z'),
    }));

    // Check files exist
    expect(await storage.exists('sessions/2025-01-15.json')).toBe(true);
    expect(await storage.exists('sessions/2025-01-17.json')).toBe(true);
  });

  test('should update existing session', async () => {
    const session = createMockSession({ id: 'test-session', hintsNeeded: 2 });
    await storage.saveSession(session);

    session.hintsNeeded = 4;
    session.solved = false;
    await storage.saveSession(session);

    const retrieved = await storage.getSession('test-session');
    expect(retrieved!.hintsNeeded).toBe(4);
    expect(retrieved!.solved).toBe(false);

    // Should still be only one session
    const count = await storage.getSessionCount();
    expect(count).toBe(1);
  });

  test('should save multiple sessions', async () => {
    const sessions = [
      createMockSession({ id: 's1' }),
      createMockSession({ id: 's2' }),
      createMockSession({ id: 's3' }),
    ];

    await storage.saveSessions(sessions);

    const count = await storage.getSessionCount();
    expect(count).toBe(3);
  });

  test('should get sessions with bug type filter', async () => {
    await storage.saveSessions([
      createMockSession({ id: 's1', bugType: 'undefined-access' }),
      createMockSession({ id: 's2', bugType: 'async-await' }),
      createMockSession({ id: 's3', bugType: 'undefined-access' }),
    ]);

    const filtered = await storage.getSessions({ bugType: 'undefined-access' });
    expect(filtered.length).toBe(2);
  });

  test('should get sessions with solved filter', async () => {
    await storage.saveSessions([
      createMockSession({ id: 's1', solved: true }),
      createMockSession({ id: 's2', solved: false, gaveUp: true }),
      createMockSession({ id: 's3', solved: true }),
    ]);

    const solved = await storage.getSessions({ solved: true });
    expect(solved.length).toBe(2);

    const unsolved = await storage.getSessions({ solved: false });
    expect(unsolved.length).toBe(1);
  });

  test('should get sessions with date range', async () => {
    await storage.saveSessions([
      createMockSession({ id: 's1', timestamp: new Date('2025-01-15T10:00:00Z') }),
      createMockSession({ id: 's2', timestamp: new Date('2025-01-16T10:00:00Z') }),
      createMockSession({ id: 's3', timestamp: new Date('2025-01-17T10:00:00Z') }),
    ]);

    const filtered = await storage.getSessions({
      startDate: new Date('2025-01-16T00:00:00Z'),
      endDate: new Date('2025-01-17T23:59:59Z'),
    });

    expect(filtered.length).toBe(2);
  });

  test('should support pagination', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.saveSession(createMockSession({ id: `session-${i}` }));
    }

    const page1 = await storage.getSessions({ limit: 3, offset: 0 });
    const page2 = await storage.getSessions({ limit: 3, offset: 3 });

    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
  });

  test('should get recent sessions sorted by date', async () => {
    await storage.saveSessions([
      createMockSession({ id: 's1', timestamp: new Date('2025-01-15T10:00:00Z') }),
      createMockSession({ id: 's2', timestamp: new Date('2025-01-17T10:00:00Z') }),
      createMockSession({ id: 's3', timestamp: new Date('2025-01-16T10:00:00Z') }),
    ]);

    const recent = await storage.getRecentSessions(2);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe('s2'); // Most recent first
    expect(recent[1].id).toBe('s3');
  });

  test('should delete session', async () => {
    await storage.saveSession(createMockSession({ id: 'to-delete' }));

    const deleted = await storage.deleteSession('to-delete');
    expect(deleted).toBe(true);
    expect(await storage.getSession('to-delete')).toBeNull();
  });

  test('should return false when deleting non-existent session', async () => {
    const deleted = await storage.deleteSession('non-existent');
    expect(deleted).toBe(false);
  });

  test('should delete date file when last session removed', async () => {
    await storage.saveSession(createMockSession({
      id: 'only-one',
      timestamp: new Date('2025-01-17T10:00:00Z'),
    }));

    expect(await storage.exists('sessions/2025-01-17.json')).toBe(true);

    await storage.deleteSession('only-one');

    expect(await storage.exists('sessions/2025-01-17.json')).toBe(false);
  });

  test('should store sessions as readable JSON', async () => {
    await storage.saveSession(createMockSession({ id: 'test-session' }));

    const raw = await storage.read('sessions/2025-01-17.json');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe('test-session');
    expect(raw!.includes('\n')).toBe(true); // Pretty-printed
  });
});

// =============================================================================
// Config Tests
// =============================================================================

describe('FileStorageAdapter - Config', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should save and retrieve config', async () => {
    const config = {
      maxHints: 5,
      enableRealTimeWarnings: true,
      theme: 'dark' as const,
    };

    await storage.saveConfig(config);

    const retrieved = await storage.getConfig();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.maxHints).toBe(5);
    expect(retrieved!.theme).toBe('dark');
  });

  test('should return null for non-existent config', async () => {
    const config = await storage.getConfig();
    expect(config).toBeNull();
  });

  test('should store config as readable JSON', async () => {
    await storage.saveConfig({ maxHints: 4 });

    const raw = await storage.read('config.json');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.maxHints).toBe(4);
  });
});

// =============================================================================
// Integration with SessionHistory Tests
// =============================================================================

describe('FileStorageAdapter - SessionHistory Integration', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should work as StorageAdapter for SessionHistory', async () => {
    const { SessionHistory } = await import('../src/storage/sessionHistory');

    const history = new SessionHistory(storage, { baseDir: TEST_DIR });

    const session = createMockSession({ id: 'via-history' });
    await history.saveSession(session);

    const retrieved = await history.getSession('via-history');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('via-history');
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe('FileStorageAdapter - Utilities', () => {
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    await cleanupTestDir();
    storage = new FileStorageAdapter({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  test('should return base directory', () => {
    expect(storage.getBaseDir()).toBe(TEST_DIR);
  });

  test('should clear all data', async () => {
    await storage.saveProfile(createMockProfile());
    await storage.saveConfig({ maxHints: 4 });
    await storage.saveSession(createMockSession());

    await storage.clearAll();

    expect(await storage.getProfile()).toBeNull();
    expect(await storage.getConfig()).toBeNull();
    expect(await storage.getSessionCount()).toBe(0);
  });
});
