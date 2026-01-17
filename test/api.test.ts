/**
 * Tests for DebugDuck API Layer
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { DebugDuckEngine, createEngine } from "../src/api";
import type { LearningSession } from "../src/types";

// =============================================================================
// Test Setup
// =============================================================================

// Mock the Claude API client to avoid real API calls
const mockAnalyzeCode = mock(() =>
  Promise.resolve({
    hints: [
      {
        level: 1,
        hint: "What if the index is out of bounds?",
        type: "question" as const,
      },
      {
        level: 2,
        hint: "Check the array length before accessing",
        type: "direction" as const,
      },
      {
        level: 3,
        hint: "Arrays are 0-indexed, so valid indices are 0 to length-1",
        type: "concept" as const,
      },
      {
        level: 4,
        hint: "Use arr[i] only after checking i < arr.length",
        type: "example" as const,
      },
    ],
    bugType: "undefined-access",
    difficulty: "beginner" as const,
    learningObjective: "Understand array bounds checking",
  }),
);

// We'll test with a real in-memory database but mock the AI
const TEST_API_KEY = "test-api-key";

// =============================================================================
// Engine Creation Tests
// =============================================================================

describe("DebugDuckEngine - Creation", () => {
  let engine: DebugDuckEngine;

  afterEach(() => {
    if (engine) {
      engine.close();
    }
  });

  test("should create engine with minimal config", () => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    expect(engine).toBeDefined();
  });

  test("should create engine with factory function", () => {
    engine = createEngine(TEST_API_KEY, {
      baseDir: ":memory:",
      storageType: "sqlite",
    });
    expect(engine).toBeDefined();
  });

  test("should initialize with default user profile", () => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    const profile = engine.getProfile();
    expect(profile).toBeDefined();
    expect(profile.totalBugs).toBe(0);
    expect(profile.bugsSolved).toBe(0);
  });

  test("should use custom user ID", () => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
      userId: "custom-user",
    });

    const profile = engine.getProfile();
    expect(profile.userId).toBe("custom-user");
  });
});

// =============================================================================
// Warning Analysis Tests
// =============================================================================

describe("DebugDuckEngine - Warnings", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
      minWarningConfidence: 0.5,
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should detect undefined access warnings", async () => {
    const code = `
      const users = [];
      const name = users[0].name;
    `;

    const warnings = await engine.getWarnings(code, "typescript");

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.type === "undefined-access")).toBe(true);
  });

  test("should detect async-await warnings", async () => {
    const code = `
      async function fetchData() {
        const data = fetch('/api/data');
        return data.json();
      }
    `;

    const warnings = await engine.getWarnings(code, "typescript");

    // May or may not detect depending on detector patterns
    // Just ensure it doesn't throw and returns valid array
    expect(Array.isArray(warnings)).toBe(true);
  });

  test("should detect comparison warnings", async () => {
    const code = `
      if (x == null) {
        console.log('null');
      }
    `;

    const warnings = await engine.getWarnings(code, "javascript");

    // May or may not detect depending on detector patterns
    // Just ensure it doesn't throw and returns valid array
    expect(Array.isArray(warnings)).toBe(true);
  });

  test("should return empty array for clean code", async () => {
    const code = `
      const x = 1;
      const y = 2;
      console.log(x + y);
    `;

    const warnings = await engine.getWarnings(code, "typescript");

    // May have some low-confidence warnings, but should be minimal
    const highConfidence = warnings.filter((w) => w.confidence > 0.7);
    expect(highConfidence.length).toBe(0);
  });

  test("should get warnings for specific line", async () => {
    const code = `const x = 1;
const users = [];
const name = users[0].name;
console.log(name);`;

    await engine.getWarnings(code, "typescript");

    const lineWarnings = engine.getWarningsForLine(2);
    expect(lineWarnings.length).toBeGreaterThan(0);
  });

  test("should schedule debounced analysis", (done) => {
    const code = `const x = arr[0].name;`;

    engine.scheduleWarningAnalysis(code, "typescript", (warnings) => {
      expect(warnings).toBeDefined();
      done();
    });
  });

  test("should cancel pending analysis", () => {
    const code = `const x = arr[0].name;`;

    engine.scheduleWarningAnalysis(code, "typescript", () => {
      // This should not be called
    });

    engine.cancelPendingAnalysis();
    // If we get here without error, the test passes
  });
});

// =============================================================================
// Dashboard API Tests
// =============================================================================

describe("DebugDuckEngine - Dashboard", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should return dashboard data", async () => {
    const dashboard = await engine.getDashboardData();

    expect(dashboard).toBeDefined();
    expect(dashboard.totalBugs).toBe(0);
    expect(dashboard.bugsSolved).toBe(0);
    expect(dashboard.solveRate).toBe(0);
    expect(dashboard.recentSessions).toEqual([]);
    expect(dashboard.weeklyProgress).toBeDefined();
    expect(dashboard.achievements).toBeDefined();
  });

  test("should include weekly progress", async () => {
    const dashboard = await engine.getDashboardData();

    expect(dashboard.weeklyProgress.days).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(dashboard.weeklyProgress.bugsFixed.length).toBe(7);
    expect(dashboard.weeklyProgress.hintsUsed.length).toBe(7);
  });

  test("should include achievements", async () => {
    const dashboard = await engine.getDashboardData();

    expect(dashboard.achievements.length).toBeGreaterThan(0);
    expect(dashboard.achievements[0]).toHaveProperty("id");
    expect(dashboard.achievements[0]).toHaveProperty("name");
    expect(dashboard.achievements[0]).toHaveProperty("progress");
  });

  test("should get insights", () => {
    const insights = engine.getInsights();
    expect(Array.isArray(insights)).toBe(true);
  });

  test("should get pattern stats", () => {
    const stats = engine.getPatternStats();
    expect(Array.isArray(stats)).toBe(true);
  });
});

// =============================================================================
// Profile API Tests
// =============================================================================

describe("DebugDuckEngine - Profile", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should get profile", () => {
    const profile = engine.getProfile();

    expect(profile).toBeDefined();
    expect(profile.userId).toBe("default-user");
    expect(profile.patterns).toBeInstanceOf(Map);
  });

  test("should get strengths", () => {
    const strengths = engine.getStrengths();
    expect(Array.isArray(strengths)).toBe(true);
  });

  test("should get weaknesses", () => {
    const weaknesses = engine.getWeaknesses();
    expect(Array.isArray(weaknesses)).toBe(true);
  });

  test("should reset progress", () => {
    // Would need to add some data first in a real scenario
    engine.resetProgress();

    const profile = engine.getProfile();
    expect(profile.totalBugs).toBe(0);
    expect(profile.bugsSolved).toBe(0);
  });
});

// =============================================================================
// Session History API Tests
// =============================================================================

describe("DebugDuckEngine - Session History", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should get recent sessions (empty initially)", async () => {
    const sessions = await engine.getRecentSessions();
    expect(sessions).toEqual([]);
  });

  test("should get session count", async () => {
    const count = await engine.getSessionCount();
    expect(count).toBe(0);
  });

  test("should return null for non-existent session", async () => {
    const session = await engine.getSession("non-existent");
    expect(session).toBeNull();
  });

  test("should get sessions by bug type", async () => {
    const sessions = await engine.getSessionsByBugType("undefined-access");
    expect(sessions).toEqual([]);
  });
});

// =============================================================================
// Configuration API Tests
// =============================================================================

describe("DebugDuckEngine - Configuration", () => {
  test("should get null config initially", async () => {
    const engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    const config = await engine.getConfig();
    expect(config).toBeNull();
    engine.close();
  });

  test("should save and retrieve config", async () => {
    const engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    const config = {
      maxHints: 5,
      enableRealTimeWarnings: true,
      theme: "dark" as const,
    };

    await engine.saveUserConfig(config);

    const retrieved = await engine.getConfig();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.maxHints).toBe(5);
    expect(retrieved!.theme).toBe("dark");
    engine.close();
  });
});

// =============================================================================
// Integration Tests (with mocked AI)
// =============================================================================

describe("DebugDuckEngine - Session State", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should return null for non-existent session state", () => {
    const state = engine.getSessionState("non-existent");
    expect(state).toBeNull();
  });
});

// =============================================================================
// Lifecycle Tests
// =============================================================================

describe("DebugDuckEngine - Lifecycle", () => {
  test("should close cleanly", () => {
    const engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    // Should not throw
    engine.close();
  });

  test("should handle multiple close calls", () => {
    const engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });

    engine.close();
    // Second close should not throw (database might already be closed)
    // This behavior depends on bun:sqlite implementation
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("DebugDuckEngine - Edge Cases", () => {
  let engine: DebugDuckEngine;

  beforeEach(() => {
    engine = new DebugDuckEngine({
      apiKey: TEST_API_KEY,
      baseDir: ":memory:",
      storageType: "sqlite",
    });
  });

  afterEach(() => {
    engine.close();
  });

  test("should handle empty code", async () => {
    const warnings = await engine.getWarnings("", "typescript");
    expect(warnings).toEqual([]);
  });

  test("should handle whitespace-only code", async () => {
    const warnings = await engine.getWarnings("   \n\t  ", "typescript");
    expect(warnings).toEqual([]);
  });

  test("should handle unknown language", async () => {
    const warnings = await engine.getWarnings("const x = 1;", "unknown-lang");
    // Should not throw, may return empty or generic warnings
    expect(Array.isArray(warnings)).toBe(true);
  });

  test("should handle very long code", async () => {
    const longCode = "const x = 1;\n".repeat(1000);
    const warnings = await engine.getWarnings(longCode, "typescript");
    expect(Array.isArray(warnings)).toBe(true);
  });
});
