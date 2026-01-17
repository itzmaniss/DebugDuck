/**
 * Tests for PreventionEngine
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { PreventionEngine } from '../src/learningEngine/preventionEngine';
import { PatternTracker } from '../src/learningEngine/patternTracker';
import type { LearningSession } from '../src/types';

// =============================================================================
// Test Helpers
// =============================================================================

function createSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: `session_${Date.now()}`,
    bug: { code: 'test', language: 'typescript' },
    bugType: 'undefined-access',
    hintsGiven: [],
    solved: true,
    hintsNeeded: 3,
    timeSpent: 60,
    timestamp: new Date(),
    gaveUp: false,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('PreventionEngine', () => {
  describe('analyzeCode', () => {
    test('should detect bugs in code', async () => {
      const engine = new PreventionEngine();
      const code = `const name = users[id].name;`;

      const result = await engine.analyzeCode(code, 'typescript', { force: true });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.skipped).toBe(false);
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('should return empty warnings for clean code', async () => {
      const engine = new PreventionEngine();
      const code = `
const name = users[id]?.name;
if (value === null) { return; }
      `;

      const result = await engine.analyzeCode(code, 'typescript', { force: true });

      expect(result.warnings.length).toBe(0);
    });

    test('should cache results for same code', async () => {
      const engine = new PreventionEngine();
      const code = `const x = arr[i].value;`;

      const result1 = await engine.analyzeCode(code, 'typescript', { force: true });
      const result2 = await engine.analyzeCode(code, 'typescript', { force: true });

      expect(result2.skipped).toBe(true);
      expect(result2.warnings).toEqual(result1.warnings);
    });

    test('should re-analyze when code changes', async () => {
      const engine = new PreventionEngine();

      const result1 = await engine.analyzeCode('const x = arr[i].value;', 'typescript', { force: true });
      const result2 = await engine.analyzeCode('const x = arr[i]?.value;', 'typescript', { force: true });

      expect(result2.skipped).toBe(false);
      expect(result2.warnings.length).toBeLessThan(result1.warnings.length);
    });

    test('should respect debounce without force flag', async () => {
      const engine = new PreventionEngine(undefined, { debounceMs: 500 });
      const code = `const x = arr[i].value;`;

      // First call goes through
      const result1 = await engine.analyzeCode(code, 'typescript');
      expect(result1.skipped).toBe(false);

      // Immediate second call should be debounced
      const result2 = await engine.analyzeCode(code + ' ', 'typescript');
      expect(result2.skipped).toBe(true);
    });

    test('should bypass debounce with force flag', async () => {
      const engine = new PreventionEngine(undefined, { debounceMs: 5000 });
      const code1 = `const x = arr[i].value;`;
      const code2 = `const y = arr[j].value;`;

      await engine.analyzeCode(code1, 'typescript', { force: true });
      const result = await engine.analyzeCode(code2, 'typescript', { force: true });

      expect(result.skipped).toBe(false);
    });
  });

  describe('pattern tracker integration', () => {
    test('should boost confidence for repeat patterns', async () => {
      const tracker = new PatternTracker();

      // Record multiple sessions with same bug type
      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 3 }));
      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 4 }));
      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 3 }));

      const engine = new PreventionEngine(tracker, { boostRepeatPatterns: true });
      const code = `const name = users[id].name;`;

      const result = await engine.analyzeCode(code, 'typescript', { force: true });
      const undefinedWarning = result.warnings.find(w => w.type === 'undefined-access');

      expect(undefinedWarning).toBeDefined();
      // Confidence should be boosted
      expect(undefinedWarning!.confidence).toBeGreaterThan(0.7);
      // Message should include personal warning
      expect(undefinedWarning!.message).toContain('times');
    });

    test('should work without pattern tracker', async () => {
      const engine = new PreventionEngine(); // No tracker
      const code = `const name = users[id].name;`;

      const result = await engine.analyzeCode(code, 'typescript', { force: true });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should allow setting tracker after construction', async () => {
      const engine = new PreventionEngine();
      const tracker = new PatternTracker();

      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 4 }));
      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 4 }));
      tracker.recordSession(createSession({ bugType: 'undefined-access', hintsNeeded: 4 }));

      engine.setPatternTracker(tracker);
      engine.clearCache();

      const code = `const name = users[id].name;`;
      const result = await engine.analyzeCode(code, 'typescript', { force: true });
      const warning = result.warnings.find(w => w.type === 'undefined-access');

      expect(warning!.message).toContain('times');
    });
  });

  describe('getWarningsForLine', () => {
    test('should return warnings for specific line', async () => {
      const engine = new PreventionEngine();
      const code = `
const a = 1;
const name = users[id].name;
const b = 2;
      `;

      await engine.analyzeCode(code, 'typescript', { force: true });
      const line2Warnings = engine.getWarningsForLine(2);

      expect(line2Warnings.length).toBeGreaterThan(0);
      expect(line2Warnings[0]!.line).toBe(2);
    });

    test('should return empty array for clean line', async () => {
      const engine = new PreventionEngine();
      const code = `
const a = 1;
const b = 2;
      `;

      await engine.analyzeCode(code, 'typescript', { force: true });
      const line1Warnings = engine.getWarningsForLine(1);

      expect(line1Warnings).toEqual([]);
    });

    test('should return empty array before any analysis', () => {
      const engine = new PreventionEngine();
      const warnings = engine.getWarningsForLine(0);

      expect(warnings).toEqual([]);
    });
  });

  describe('getCurrentWarnings', () => {
    test('should return all current warnings', async () => {
      const engine = new PreventionEngine();
      const code = `
const name = users[id].name;
for (let i = 0; i <= arr.length; i++) {}
      `;

      await engine.analyzeCode(code, 'typescript', { force: true });
      const warnings = engine.getCurrentWarnings();

      expect(warnings.length).toBeGreaterThan(0);
    });

    test('should return empty array before analysis', () => {
      const engine = new PreventionEngine();
      expect(engine.getCurrentWarnings()).toEqual([]);
    });
  });

  describe('clearCache', () => {
    test('should clear cached results', async () => {
      const engine = new PreventionEngine();
      const code = `const name = users[id].name;`;

      await engine.analyzeCode(code, 'typescript', { force: true });
      expect(engine.getCurrentWarnings().length).toBeGreaterThan(0);

      engine.clearCache();
      expect(engine.getCurrentWarnings()).toEqual([]);
    });

    test('should force re-analysis after clear', async () => {
      const engine = new PreventionEngine();
      const code = `const name = users[id].name;`;

      await engine.analyzeCode(code, 'typescript', { force: true });
      engine.clearCache();

      const result = await engine.analyzeCode(code, 'typescript', { force: true });
      expect(result.skipped).toBe(false);
    });
  });

  describe('scheduleAnalysis', async () => {
    test('should call callback after debounce delay', async () => {
      const engine = new PreventionEngine(undefined, { debounceMs: 50 });
      const code = `const name = users[id].name;`;

      const result = await new Promise<any>((resolve) => {
        engine.scheduleAnalysis(code, 'typescript', resolve);
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.skipped).toBe(false);
    });

    test('should cancel previous scheduled analysis', async () => {
      const engine = new PreventionEngine(undefined, { debounceMs: 50 });
      let callCount = 0;

      // Schedule multiple analyses rapidly
      engine.scheduleAnalysis('code1', 'typescript', () => callCount++);
      engine.scheduleAnalysis('code2', 'typescript', () => callCount++);
      engine.scheduleAnalysis('code3', 'typescript', () => callCount++);

      // Wait for debounce
      await new Promise(r => setTimeout(r, 100));

      // Only the last one should have been called
      expect(callCount).toBe(1);
    });
  });

  describe('cancelPendingAnalysis', () => {
    test('should cancel scheduled analysis', async () => {
      const engine = new PreventionEngine(undefined, { debounceMs: 50 });
      let called = false;

      engine.scheduleAnalysis('code', 'typescript', () => { called = true; });
      engine.cancelPendingAnalysis();

      await new Promise(r => setTimeout(r, 100));
      expect(called).toBe(false);
    });
  });

  describe('warning sorting', () => {
    test('should sort by severity then line number', async () => {
      const engine = new PreventionEngine();
      // This code has multiple warning types
      const code = `
while (true) { doSomething(); }
const x = arr[i].value;
if (a == b) { }
      `;

      const result = await engine.analyzeCode(code, 'typescript', { force: true });
      const warnings = result.warnings;

      // Errors should come before warnings
      for (let i = 1; i < warnings.length; i++) {
        const prev = warnings[i - 1]!;
        const curr = warnings[i]!;

        const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
        const prevSeverity = severityOrder[prev.severity] ?? 1;
        const currSeverity = severityOrder[curr.severity] ?? 1;

        if (prevSeverity === currSeverity) {
          expect(prev.line).toBeLessThanOrEqual(curr.line);
        } else {
          expect(prevSeverity).toBeLessThanOrEqual(currSeverity);
        }
      }
    });
  });

  describe('minConfidence option', () => {
    test('should filter out low confidence warnings', async () => {
      const highConfEngine = new PreventionEngine(undefined, { minConfidence: 0.9 });
      const lowConfEngine = new PreventionEngine(undefined, { minConfidence: 0.5 });

      const code = `const name = users[id].name;`;

      const highResult = await highConfEngine.analyzeCode(code, 'typescript', { force: true });
      const lowResult = await lowConfEngine.analyzeCode(code, 'typescript', { force: true });

      expect(lowResult.warnings.length).toBeGreaterThanOrEqual(highResult.warnings.length);
    });
  });
});
