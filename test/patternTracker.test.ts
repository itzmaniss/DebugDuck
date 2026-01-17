/**
 * Tests for PatternTracker
 */

import { test, expect, describe } from "bun:test";
import { PatternTracker } from "../src/learningEngine/patternTracker";
import type { LearningSession, Bug } from "../src/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock learning session
 */
function createSession(
  overrides: Partial<LearningSession> = {},
): LearningSession {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    bug: {
      code: "const x = arr[i].name;",
      language: "typescript",
    },
    bugType: "undefined-access",
    hintsGiven: [],
    solved: true,
    hintsNeeded: 2,
    timeSpent: 60,
    timestamp: new Date(),
    gaveUp: false,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("PatternTracker", () => {
  describe("recordSession", () => {
    test("should record a session and update profile", () => {
      const tracker = new PatternTracker();
      const session = createSession();

      tracker.recordSession(session);
      const profile = tracker.getProfile();

      expect(profile.totalBugs).toBe(1);
      expect(profile.bugsSolved).toBe(1);
      expect(profile.bugsGaveUp).toBe(0);
    });

    test("should track gave up sessions", () => {
      const tracker = new PatternTracker();
      const session = createSession({ solved: false, gaveUp: true });

      tracker.recordSession(session);
      const profile = tracker.getProfile();

      expect(profile.bugsSolved).toBe(0);
      expect(profile.bugsGaveUp).toBe(1);
    });

    test("should calculate average hints correctly", () => {
      const tracker = new PatternTracker();

      tracker.recordSession(createSession({ hintsNeeded: 2 }));
      tracker.recordSession(createSession({ hintsNeeded: 4 }));

      const profile = tracker.getProfile();
      expect(profile.averageHintsPerBug).toBe(3);
    });

    test("should create pattern for new bug type", () => {
      const tracker = new PatternTracker();
      const session = createSession({ bugType: "null-reference" });

      tracker.recordSession(session);
      const stats = tracker.getPatternStats();

      expect(stats).toHaveLength(1);
      expect(stats[0]!.type).toBe("null-reference");
      expect(stats[0]!.count).toBe(1);
    });

    test("should aggregate pattern statistics", () => {
      const tracker = new PatternTracker();

      tracker.recordSession(
        createSession({ bugType: "undefined-access", hintsNeeded: 2 }),
      );
      tracker.recordSession(
        createSession({ bugType: "undefined-access", hintsNeeded: 4 }),
      );
      tracker.recordSession(
        createSession({ bugType: "null-reference", hintsNeeded: 1 }),
      );

      const stats = tracker.getPatternStats();

      // Should be sorted by count (most common first)
      expect(stats[0]!.type).toBe("undefined-access");
      expect(stats[0]!.count).toBe(2);
      expect(stats[0]!.averageHints).toBe(3);

      expect(stats[1]!.type).toBe("null-reference");
      expect(stats[1]!.count).toBe(1);
    });
  });

  describe("getInsights", () => {
    test("should return suggestion when not enough data", () => {
      const tracker = new PatternTracker();
      tracker.recordSession(createSession());

      const insights = tracker.getInsights();

      expect(insights).toHaveLength(1);
      expect(insights[0]!.type).toBe("suggestion");
      expect(insights[0]!.message).toContain("more bugs");
    });

    test("should detect weakness when average hints is high", () => {
      const tracker = new PatternTracker();

      // Record 3 sessions with high hint usage
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 4 }),
      );
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 4 }),
      );
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 4 }),
      );

      const insights = tracker.getInsights();
      const warning = insights.find((i) => i.type === "warning");

      expect(warning).toBeDefined();
      expect(warning!.message).toContain("Async Await");
      expect(warning!.relatedPattern).toBe("async-await");
    });

    test("should show streak achievement when streak >= 3", () => {
      // Create a profile with an existing streak
      const existingProfile = {
        userId: "test_user",
        totalBugs: 10,
        bugsSolved: 10,
        bugsGaveUp: 0,
        averageHintsPerBug: 2,
        patterns: new Map(),
        strengths: [],
        weaknesses: [],
        streak: 5, // 5-day streak
        lastActive: new Date(),
        createdAt: new Date(),
      };

      const tracker = new PatternTracker(existingProfile);

      // Need 3 sessions for insights to work
      tracker.recordSession(createSession());
      tracker.recordSession(createSession());
      tracker.recordSession(createSession());

      const insights = tracker.getInsights();
      const achievement = insights.find((i) => i.type === "achievement");

      expect(achievement).toBeDefined();
      expect(achievement!.message).toContain("streak");
    });
  });

  describe("shouldWarn", () => {
    test("should return null for unknown bug type", () => {
      const tracker = new PatternTracker();
      expect(tracker.shouldWarn("unknown-type")).toBeNull();
    });

    test("should return null for infrequent bug type", () => {
      const tracker = new PatternTracker();
      tracker.recordSession(createSession({ bugType: "off-by-one" }));

      expect(tracker.shouldWarn("off-by-one")).toBeNull();
    });

    test("should warn for recurring pattern with high hint usage", () => {
      const tracker = new PatternTracker();

      // Record 3 sessions with 3+ hints each
      tracker.recordSession(
        createSession({ bugType: "undefined-access", hintsNeeded: 3 }),
      );
      tracker.recordSession(
        createSession({ bugType: "undefined-access", hintsNeeded: 4 }),
      );
      tracker.recordSession(
        createSession({ bugType: "undefined-access", hintsNeeded: 3 }),
      );

      const warning = tracker.shouldWarn("undefined-access");

      expect(warning).not.toBeNull();
      expect(warning).toContain("3 times");
    });

    test("should warn for frequently recurring pattern", () => {
      const tracker = new PatternTracker();

      // Record 5 sessions (even with low hints, frequency matters)
      for (let i = 0; i < 5; i++) {
        tracker.recordSession(
          createSession({ bugType: "null-reference", hintsNeeded: 1 }),
        );
      }

      const warning = tracker.shouldWarn("null-reference");

      expect(warning).not.toBeNull();
      expect(warning).toContain("recurring pattern");
    });
  });

  describe("getStrengths and getWeaknesses", () => {
    test("should identify strengths (low hint usage)", () => {
      const tracker = new PatternTracker();

      // Good at this type (3+ occurrences, avg <= 2 hints)
      tracker.recordSession(
        createSession({ bugType: "off-by-one", hintsNeeded: 1 }),
      );
      tracker.recordSession(
        createSession({ bugType: "off-by-one", hintsNeeded: 2 }),
      );
      tracker.recordSession(
        createSession({ bugType: "off-by-one", hintsNeeded: 2 }),
      );

      const strengths = tracker.getStrengths();
      expect(strengths).toContain("off-by-one");
    });

    test("should identify weaknesses (high hint usage)", () => {
      const tracker = new PatternTracker();

      // Struggles with this type (3+ occurrences, avg >= 3 hints)
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 4 }),
      );
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 3 }),
      );
      tracker.recordSession(
        createSession({ bugType: "async-await", hintsNeeded: 4 }),
      );

      const weaknesses = tracker.getWeaknesses();
      expect(weaknesses).toContain("async-await");
    });

    test("should not classify with insufficient data", () => {
      const tracker = new PatternTracker();

      // Only 2 sessions - not enough to classify
      tracker.recordSession(
        createSession({ bugType: "scope-issue", hintsNeeded: 1 }),
      );
      tracker.recordSession(
        createSession({ bugType: "scope-issue", hintsNeeded: 1 }),
      );

      expect(tracker.getStrengths()).not.toContain("scope-issue");
      expect(tracker.getWeaknesses()).not.toContain("scope-issue");
    });
  });

  describe("loadSessions", () => {
    test("should restore state from sessions", () => {
      const tracker = new PatternTracker();

      const sessions = [
        createSession({ bugType: "type-a", hintsNeeded: 2 }),
        createSession({ bugType: "type-a", hintsNeeded: 3 }),
        createSession({ bugType: "type-b", hintsNeeded: 1 }),
      ];

      tracker.loadSessions(sessions);

      const profile = tracker.getProfile();
      expect(profile.totalBugs).toBe(3);

      const stats = tracker.getPatternStats();
      expect(stats).toHaveLength(2);
    });

    test("should rebuild patterns correctly", () => {
      const tracker = new PatternTracker();

      const sessions = [
        createSession({ bugType: "undefined-access", hintsNeeded: 2 }),
        createSession({ bugType: "undefined-access", hintsNeeded: 4 }),
      ];

      tracker.loadSessions(sessions);

      const stats = tracker.getPatternStats();
      const pattern = stats.find((s) => s.type === "undefined-access");

      expect(pattern).toBeDefined();
      expect(pattern!.count).toBe(2);
      expect(pattern!.averageHints).toBe(3);
    });
  });

  describe("getImprovementStats", () => {
    test("should calculate improvement percentage", () => {
      const tracker = new PatternTracker();

      // Record 10 sessions - first 5 with high hints, last 5 with low hints
      for (let i = 0; i < 5; i++) {
        tracker.recordSession(
          createSession({ bugType: "improving-type", hintsNeeded: 4 }),
        );
      }
      for (let i = 0; i < 5; i++) {
        tracker.recordSession(
          createSession({ bugType: "improving-type", hintsNeeded: 2 }),
        );
      }

      const stats = tracker.getImprovementStats();
      const improvement = stats.find((s) => s.type === "improving-type");

      expect(improvement).toBeDefined();
      expect(improvement!.improvement).toBeGreaterThan(0);
      expect(improvement!.newAverage).toBeLessThan(improvement!.oldAverage);
    });
  });

  describe("profile persistence", () => {
    test("should use local_user as default userId", () => {
      const tracker = new PatternTracker();
      const profile = tracker.getProfile();

      expect(profile.userId).toBe("local_user");
    });

    test("should preserve userId from existing profile", () => {
      const existingProfile = {
        userId: "existing_user_123",
        totalBugs: 5,
        bugsSolved: 4,
        bugsGaveUp: 1,
        averageHintsPerBug: 2.5,
        patterns: new Map(),
        strengths: [],
        weaknesses: [],
        streak: 3,
        lastActive: new Date(),
        createdAt: new Date(),
      };

      const tracker = new PatternTracker(existingProfile);
      const profile = tracker.getProfile();

      expect(profile.userId).toBe("existing_user_123");
      expect(profile.totalBugs).toBe(5);
    });
  });
});
