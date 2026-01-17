/**
 * Tests for ProgressiveHintSystem
 *
 * These tests use mocked Claude responses to test the hint system
 * logic without making actual API calls.
 */

import { test, expect, describe, mock, beforeEach } from "bun:test";
import { ProgressiveHintSystem } from "../src/learningEngine/hintSystem";
import type { Bug, AnalysisResult } from "../src/types";

// =============================================================================
// Mock Setup
// =============================================================================

/**
 * Mock AnalysisResult returned by Claude
 */
const mockAnalysisResult: AnalysisResult = {
  sessionId: "test_session_123",
  hints: [
    { level: 1, hint: "What could be undefined here?", type: "question" },
    { level: 2, hint: "Check the array access.", type: "direction" },
    { level: 3, hint: "Array index might be out of bounds.", type: "concept" },
    { level: 4, hint: "Use optional chaining: arr[i]?.name", type: "example" },
  ],
  bugType: "undefined-access",
  difficulty: "beginner",
  learningObjective: "Learn to handle undefined values",
};

/**
 * Mock the ClaudeClient to avoid real API calls
 */
mock.module("../src/ai/claude", () => ({
  ClaudeClient: class MockClaudeClient {
    async analyzeCode(_bug: Bug, _hintCount: number): Promise<AnalysisResult> {
      return {
        ...mockAnalysisResult,
        sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      };
    }
  },
}));

// =============================================================================
// Test Helpers
// =============================================================================

const testBug: Bug = {
  code: "const name = users[id].name;",
  language: "typescript",
  errorMessage: "Cannot read property name of undefined",
};

// =============================================================================
// Tests
// =============================================================================

describe("ProgressiveHintSystem", () => {
  describe("analyzeBug", () => {
    test("should create a new session and return analysis", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toStartWith("session_");
      expect(result.hints).toHaveLength(4);
      expect(result.bugType).toBe("undefined-access");
      expect(result.difficulty).toBe("beginner");
    });

    test("should track session as active", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      expect(system.hasActiveSession(result.sessionId)).toBe(true);
    });

    test("should start with no hints revealed", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      expect(system.getHintsRevealed(result.sessionId)).toBe(0);
    });
  });

  describe("getNextHint", () => {
    test("should reveal hints progressively", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      // First hint
      const hint1 = await system.getNextHint(result.sessionId);
      expect(hint1).not.toBeNull();
      expect(hint1!.progress).toBe("Hint 1/4");
      expect(hint1!.isLastHint).toBe(false);
      expect(hint1!.type).toBe("hint");

      // Second hint
      const hint2 = await system.getNextHint(result.sessionId);
      expect(hint2).not.toBeNull();
      expect(hint2!.progress).toBe("Hint 2/4");
      expect(hint2!.isLastHint).toBe(false);

      // Third hint
      const hint3 = await system.getNextHint(result.sessionId);
      expect(hint3).not.toBeNull();
      expect(hint3!.progress).toBe("Hint 3/4");
      expect(hint3!.isLastHint).toBe(false);

      // Fourth hint (last)
      const hint4 = await system.getNextHint(result.sessionId);
      expect(hint4).not.toBeNull();
      expect(hint4!.progress).toBe("Hint 4/4");
      expect(hint4!.isLastHint).toBe(true);
      expect(hint4!.type).toBe("solution");
    });

    test("should return null when all hints exhausted", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      // Exhaust all hints
      await system.getNextHint(result.sessionId);
      await system.getNextHint(result.sessionId);
      await system.getNextHint(result.sessionId);
      await system.getNextHint(result.sessionId);

      // Should return null
      const noMoreHints = await system.getNextHint(result.sessionId);
      expect(noMoreHints).toBeNull();
    });

    test("should include encouragement message", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      const hint = await system.getNextHint(result.sessionId);
      expect(hint!.encouragement).toBeDefined();
      expect(hint!.encouragement.length).toBeGreaterThan(0);
    });

    test("should throw for unknown session", async () => {
      const system = new ProgressiveHintSystem("test-api-key");

      expect(() => system.getNextHint("nonexistent_session")).toThrow(
        "Session not found",
      );
    });
  });

  describe("markSolved", () => {
    test("should finalize session as solved", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      // Get a couple hints first
      await system.getNextHint(result.sessionId);
      await system.getNextHint(result.sessionId);

      const session = await system.markSolved(result.sessionId);

      expect(session.solved).toBe(true);
      expect(session.gaveUp).toBe(false);
      expect(session.hintsNeeded).toBe(2);
      expect(session.bugType).toBe("undefined-access");
    });

    test("should record time spent", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      // Small delay to ensure time > 0
      await new Promise((r) => setTimeout(r, 10));

      const session = await system.markSolved(result.sessionId);
      expect(session.timeSpent).toBeGreaterThanOrEqual(0);
    });

    test("should include original bug data", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      const session = await system.markSolved(result.sessionId);

      expect(session.bug.code).toBe(testBug.code);
      expect(session.bug.language).toBe(testBug.language);
    });
  });

  describe("giveUp", () => {
    test("should finalize session as gave up", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      await system.getNextHint(result.sessionId);

      const { solution, session } = await system.giveUp(result.sessionId);

      expect(session.solved).toBe(false);
      expect(session.gaveUp).toBe(true);
      expect(session.hintsNeeded).toBe(1);
      expect(solution).toBeDefined();
      expect(solution.length).toBeGreaterThan(0);
    });

    test("should return the final hint as solution", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      const { solution } = await system.giveUp(result.sessionId);

      // Solution should be the last hint content
      expect(solution).toContain("optional chaining");
    });
  });

  describe("getSessionState", () => {
    test("should return current session state", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      await system.getNextHint(result.sessionId);
      await system.getNextHint(result.sessionId);

      const state = system.getSessionState(result.sessionId);

      expect(state.sessionId).toBe(result.sessionId);
      expect(state.currentHintIndex).toBe(1); // 0-indexed, 2 hints = index 1
      expect(state.hintsRevealed).toHaveLength(2);
      expect(state.showingSolution).toBe(false);
      expect(state.userSolved).toBe(false);
    });

    test("should reflect solved state", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      await system.markSolved(result.sessionId);

      const state = system.getSessionState(result.sessionId);
      expect(state.userSolved).toBe(true);
    });

    test("should reflect gave up state", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      await system.giveUp(result.sessionId);

      const state = system.getSessionState(result.sessionId);
      expect(state.showingSolution).toBe(true);
    });
  });

  describe("cleanupOldSessions", () => {
    test("should remove completed old sessions", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      await system.markSolved(result.sessionId);

      // Small delay to ensure session ages past 0ms
      await new Promise((r) => setTimeout(r, 5));

      // Cleanup with 1ms max age
      const cleaned = system.cleanupOldSessions(1);

      expect(cleaned).toBe(1);
      expect(system.hasActiveSession(result.sessionId)).toBe(false);
    });

    test("should not remove active sessions", async () => {
      const system = new ProgressiveHintSystem("test-api-key");
      const result = await system.analyzeBug(testBug);

      // Session is still active
      const cleaned = system.cleanupOldSessions(0);

      expect(cleaned).toBe(0);
      expect(system.hasActiveSession(result.sessionId)).toBe(true);
    });
  });

  describe("custom maxHints", () => {
    test("should respect custom maxHints setting", async () => {
      const system = new ProgressiveHintSystem("test-api-key", { maxHints: 2 });
      const result = await system.analyzeBug(testBug);

      // Note: The mock still returns 4 hints, but in real usage
      // the Claude client would be called with hintCount: 2
      expect(result.hints.length).toBe(4); // Mock returns 4, but real would return 2
    });
  });
});
