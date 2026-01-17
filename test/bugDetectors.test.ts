/**
 * Tests for BugDetector
 */

import { test, expect, describe } from 'bun:test';
import { BugDetector } from '../src/learningEngine/bugDetectors';

// =============================================================================
// Tests
// =============================================================================

describe('BugDetector', () => {
  const detector = new BugDetector();

  describe('undefined-access', () => {
    test('should detect array index property access', () => {
      const code = `
const name = users[id].name;
const value = items[index].value;
      `;
      const bugs = detector.detect(code, 'typescript');
      const undefinedBugs = bugs.filter(b => b.type === 'undefined-access');

      expect(undefinedBugs.length).toBeGreaterThanOrEqual(2);
    });

    test('should not flag optional chaining', () => {
      const code = `
const name = users[id]?.name;
const value = items[index]?.value;
      `;
      const bugs = detector.detect(code, 'typescript');
      const undefinedBugs = bugs.filter(b => b.type === 'undefined-access');

      expect(undefinedBugs.length).toBe(0);
    });

    test('should not flag lines with if checks', () => {
      const code = `
if (users[id]) {
  const name = users[id].name;
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const undefinedBugs = bugs.filter(b => b.type === 'undefined-access');

      // The if line itself should not be flagged
      expect(undefinedBugs.every(b => b.line !== 1)).toBe(true);
    });
  });

  describe('async-await', () => {
    test('should detect .then() inside async function', () => {
      const code = `
async function fetchData() {
  fetch('/api').then(res => res.json());
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const asyncBugs = bugs.filter(b => b.type === 'async-await');

      expect(asyncBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should not flag .then() outside async function', () => {
      const code = `
function fetchData() {
  return fetch('/api').then(res => res.json());
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const asyncBugs = bugs.filter(b => b.type === 'async-await');

      // .then() is fine in non-async functions
      expect(asyncBugs.length).toBe(0);
    });

    test('should detect await outside async', () => {
      const code = `
function getData() {
  const data = await fetch('/api');
  return data;
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const asyncBugs = bugs.filter(b => b.type === 'async-await');

      expect(asyncBugs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('off-by-one', () => {
    test('should detect <= length in loop', () => {
      const code = `
for (let i = 0; i <= arr.length; i++) {
  console.log(arr[i]);
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const offByOneBugs = bugs.filter(b => b.type === 'off-by-one');

      expect(offByOneBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should detect direct arr[arr.length] access', () => {
      const code = `
const last = items[items.length];
      `;
      const bugs = detector.detect(code, 'typescript');
      const offByOneBugs = bugs.filter(b => b.type === 'off-by-one');

      expect(offByOneBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should not flag < length (correct usage)', () => {
      const code = `
for (let i = 0; i < arr.length; i++) {
  console.log(arr[i]);
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const offByOneBugs = bugs.filter(b => b.type === 'off-by-one');

      expect(offByOneBugs.length).toBe(0);
    });
  });

  describe('comparison-error', () => {
    test('should detect == instead of ===', () => {
      const code = `
if (value == null) {
  return;
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const comparisonBugs = bugs.filter(b => b.type === 'comparison-error');

      expect(comparisonBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should not flag ===', () => {
      const code = `
if (value === null) {
  return;
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const comparisonBugs = bugs.filter(b => b.type === 'comparison-error');

      expect(comparisonBugs.length).toBe(0);
    });

    test('should not flag variable declarations', () => {
      const code = `
const value = 5;
let name = 'test';
var count = 0;
      `;
      const bugs = detector.detect(code, 'typescript');
      const comparisonBugs = bugs.filter(b => b.type === 'comparison-error');

      expect(comparisonBugs.length).toBe(0);
    });
  });

  describe('missing-error-handling', () => {
    test('should detect fetch without .catch', () => {
      const code = `
async function getData() {
  const res = await fetch('/api');
  return res.json();
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const errorBugs = bugs.filter(b => b.type === 'missing-error-handling');

      expect(errorBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should not flag fetch with .catch nearby', () => {
      const code = `
fetch('/api')
  .then(res => res.json())
  .catch(err => console.error(err));
      `;
      const bugs = detector.detect(code, 'typescript');
      const errorBugs = bugs.filter(b => b.type === 'missing-error-handling');

      expect(errorBugs.length).toBe(0);
    });
  });

  describe('infinite-loop', () => {
    test('should detect while(true) without break', () => {
      const code = `
while (true) {
  doSomething();
  doMore();
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const loopBugs = bugs.filter(b => b.type === 'infinite-loop');

      expect(loopBugs.length).toBeGreaterThanOrEqual(1);
    });

    test('should not flag while(true) with break', () => {
      const code = `
while (true) {
  if (condition) {
    break;
  }
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const loopBugs = bugs.filter(b => b.type === 'infinite-loop');

      expect(loopBugs.length).toBe(0);
    });

    test('should not flag while(true) with return', () => {
      const code = `
function loop() {
  while (true) {
    if (done) {
      return result;
    }
  }
}
      `;
      const bugs = detector.detect(code, 'typescript');
      const loopBugs = bugs.filter(b => b.type === 'infinite-loop');

      expect(loopBugs.length).toBe(0);
    });
  });

  describe('getWarnings', () => {
    test('should return warnings with suggestions', () => {
      const code = `
const name = users[id].name;
      `;
      const warnings = detector.getWarnings(code, 'typescript');

      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0]!.suggestion).toBeDefined();
      expect(warnings[0]!.severity).toBeDefined();
    });

    test('should filter by minimum confidence', () => {
      const code = `
const name = users[id].name;
if (value == null) { }
      `;

      // High threshold should filter out low confidence detections
      const highConfidence = detector.getWarnings(code, 'typescript', 0.9);
      const lowConfidence = detector.getWarnings(code, 'typescript', 0.5);

      expect(lowConfidence.length).toBeGreaterThanOrEqual(highConfidence.length);
    });

    test('should deduplicate warnings on same line', () => {
      const code = `
const a = arr[i].x; const b = arr[j].y;
      `;
      const warnings = detector.getWarnings(code, 'typescript');

      // Should not have duplicate undefined-access on line 1
      const line1Warnings = warnings.filter(w => w.line === 1 && w.type === 'undefined-access');
      expect(line1Warnings.length).toBeLessThanOrEqual(1);
    });
  });

  describe('language filtering', () => {
    test('should not run JS detectors on Python', () => {
      const code = `
const name = users[id].name;
if (value === null) { }
      `;
      const bugs = detector.detect(code, 'python');

      // JS-specific detectors should not trigger for Python
      const jsBugs = bugs.filter(b =>
        b.type === 'undefined-access' || b.type === 'comparison-error'
      );
      expect(jsBugs.length).toBe(0);
    });

    test('should run off-by-one detector on multiple languages', () => {
      const code = `
for (let i = 0; i <= arr.length; i++) { }
      `;

      const tsBugs = detector.detect(code, 'typescript');
      const jsBugs = detector.detect(code, 'javascript');

      expect(tsBugs.filter(b => b.type === 'off-by-one').length).toBeGreaterThan(0);
      expect(jsBugs.filter(b => b.type === 'off-by-one').length).toBeGreaterThan(0);
    });
  });

  describe('getSupportedTypes', () => {
    test('should return all detector types', () => {
      const types = detector.getSupportedTypes();

      expect(types).toContain('undefined-access');
      expect(types).toContain('null-reference');
      expect(types).toContain('async-await');
      expect(types).toContain('off-by-one');
      expect(types).toContain('comparison-error');
      expect(types).toContain('missing-error-handling');
      expect(types).toContain('infinite-loop');
    });
  });

  describe('getDetectorInfo', () => {
    test('should return detector config', () => {
      const info = detector.getDetectorInfo('undefined-access');

      expect(info).toBeDefined();
      expect(info!.type).toBe('undefined-access');
      expect(info!.suggestion).toBeDefined();
      expect(info!.confidence).toBeGreaterThan(0);
    });

    test('should return undefined for unknown type', () => {
      const info = detector.getDetectorInfo('nonexistent-type');

      expect(info).toBeUndefined();
    });
  });

  describe('error resilience', () => {
    test('should handle empty code', () => {
      const bugs = detector.detect('', 'typescript');
      expect(bugs).toEqual([]);
    });

    test('should handle code with only whitespace', () => {
      const bugs = detector.detect('   \n\n   ', 'typescript');
      expect(bugs).toEqual([]);
    });

    test('should handle malformed code gracefully', () => {
      const code = `
{{{{
const x = [[[
if (((
      `;
      // Should not throw
      expect(() => detector.detect(code, 'typescript')).not.toThrow();
    });
  });
});
