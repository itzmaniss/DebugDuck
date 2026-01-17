/**
 * BugDetectors - Pattern Detection Algorithms
 *
 * This module contains regex-based and AST-lite detectors for common bugs.
 * Used by the PreventionEngine to scan code in real-time.
 *
 * Design Principles:
 * 1. Fast - must run on every keystroke (debounced)
 * 2. Low false positives - better to miss than annoy
 * 3. Language-aware - different patterns for different languages
 *
 * @module learningEngine/bugDetectors
 */

import type { DetectedBug, Warning, SupportedLanguage, BugType } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * A detector function that scans code for a specific bug pattern.
 * Returns array of detected issues with line numbers.
 */
type DetectorFn = (code: string, lines: string[]) => DetectedBug[];

/**
 * Configuration for a bug detector
 */
interface DetectorConfig {
  /** Bug type identifier */
  type: BugType | string;
  /** Human-readable description */
  description: string;
  /** Languages this detector applies to */
  languages: SupportedLanguage[];
  /** Warning severity */
  severity: 'info' | 'warning' | 'error';
  /** Detection function */
  detect: DetectorFn;
  /** Suggestion for fixing */
  suggestion: string;
  /** Base confidence (0-1), may be adjusted by context */
  confidence: number;
}

// =============================================================================
// Detector Implementations
// =============================================================================

/**
 * Detect potential undefined property access.
 * Pattern: obj[variable].property or arr[i].property
 */
const undefinedAccessDetector: DetectorConfig = {
  type: 'undefined-access',
  description: 'Potential undefined property access',
  languages: ['typescript', 'javascript'],
  severity: 'warning',
  confidence: 0.7,
  suggestion: 'Use optional chaining (?.) or check if value exists first.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    // Pattern: something[variable].property (without optional chaining)
    const pattern = /(\w+)\[([^\]]+)\]\.(\w+)/g;

    lines.forEach((line, index) => {
      // Skip if already using optional chaining
      if (line.includes('?.')) return;

      // Skip if line has a null check before access
      if (line.includes('if (') || line.includes('if(')) return;

      let match;
      while ((match = pattern.exec(line)) !== null) {
        bugs.push({
          type: 'undefined-access',
          line: index,
          code: match[0],
          context: line.trim(),
        });
      }
      pattern.lastIndex = 0; // Reset regex
    });

    return bugs;
  },
};

/**
 * Detect potential null reference errors.
 * Pattern: variable.property without null check
 */
const nullReferenceDetector: DetectorConfig = {
  type: 'null-reference',
  description: 'Potential null reference',
  languages: ['typescript', 'javascript'],
  severity: 'warning',
  confidence: 0.6,
  suggestion: 'Check if the value is null/undefined before accessing properties.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    // Look for function parameters being accessed without checks
    // This is a simplified heuristic
    const funcPattern = /function\s+\w+\s*\(([^)]+)\)/;
    const arrowPattern = /\(([^)]+)\)\s*=>/;

    let params: string[] = [];

    lines.forEach((line, index) => {
      // Capture function parameters
      const funcMatch = line.match(funcPattern) || line.match(arrowPattern);
      if (funcMatch && funcMatch[1]) {
        params = funcMatch[1].split(',').map(p => p.trim().split(':')[0]?.trim() || '');
      }

      // Check if params are accessed without null check in first few lines after function def
      if (params.length > 0) {
        for (const param of params) {
          if (!param) continue;
          const accessPattern = new RegExp(`${param}\\.\\w+`);
          if (accessPattern.test(line) && !line.includes('if') && !line.includes('?')) {
            // Only flag if it's within 5 lines of function definition (likely no check yet)
            bugs.push({
              type: 'null-reference',
              line: index,
              code: line.match(accessPattern)?.[0] || '',
              context: line.trim(),
            });
          }
        }
      }
    });

    return bugs;
  },
};

/**
 * Detect async/await issues.
 * Pattern: async function without await, or missing async
 */
const asyncAwaitDetector: DetectorConfig = {
  type: 'async-await',
  description: 'Potential async/await issue',
  languages: ['typescript', 'javascript'],
  severity: 'warning',
  confidence: 0.75,
  suggestion: 'Ensure async functions use await, and await is only used in async functions.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    let inAsyncFunction = false;
    let asyncFunctionStart = -1;
    let braceCount = 0;

    lines.forEach((line, index) => {
      // Track async function boundaries
      if (line.includes('async ')) {
        inAsyncFunction = true;
        asyncFunctionStart = index;
        braceCount = 0;
      }

      if (inAsyncFunction) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (braceCount <= 0 && asyncFunctionStart !== index) {
          inAsyncFunction = false;
        }
      }

      // Detect await outside async function
      if (!inAsyncFunction && line.includes('await ') && !line.includes('async ')) {
        bugs.push({
          type: 'async-await',
          line: index,
          code: 'await',
          context: line.trim(),
        });
      }

      // Detect Promise without await (common mistake)
      if (inAsyncFunction) {
        const promisePattern = /\.(then|catch)\s*\(/;
        if (promisePattern.test(line)) {
          bugs.push({
            type: 'async-await',
            line: index,
            code: line.match(promisePattern)?.[0] || '.then()',
            context: line.trim(),
          });
        }
      }
    });

    return bugs;
  },
};

/**
 * Detect off-by-one errors in loops.
 * Pattern: <= array.length or < array.length - 1
 */
const offByOneDetector: DetectorConfig = {
  type: 'off-by-one',
  description: 'Potential off-by-one error',
  languages: ['typescript', 'javascript', 'python', 'java'],
  severity: 'warning',
  confidence: 0.65,
  suggestion: 'Array indices are 0-based. Use < length, not <= length.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    lines.forEach((line, index) => {
      // Pattern: i <= arr.length or i <= something.length
      const pattern = /(\w+)\s*<=\s*(\w+)\.(length|size|count)/;
      const match = line.match(pattern);

      if (match) {
        bugs.push({
          type: 'off-by-one',
          line: index,
          code: match[0],
          context: line.trim(),
        });
      }

      // Pattern: accessing arr[arr.length] directly
      const directAccess = /(\w+)\[(\1)\.length\]/;
      const directMatch = line.match(directAccess);

      if (directMatch) {
        bugs.push({
          type: 'off-by-one',
          line: index,
          code: directMatch[0],
          context: line.trim(),
        });
      }
    });

    return bugs;
  },
};

/**
 * Detect comparison errors.
 * Pattern: = instead of ==, == instead of ===
 */
const comparisonDetector: DetectorConfig = {
  type: 'comparison-error',
  description: 'Potential comparison error',
  languages: ['typescript', 'javascript'],
  severity: 'warning',
  confidence: 0.8,
  suggestion: 'Use === for strict equality. Be careful not to use = (assignment) instead of == (comparison).',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    lines.forEach((line, index) => {
      // Skip lines that are clearly assignments (const, let, var)
      if (/^\s*(const|let|var)\s/.test(line)) return;

      // Pattern: single = in condition (if, while, ternary)
      const conditionPattern = /\b(if|while)\s*\([^)]*[^=!<>]=[^=][^)]*\)/;
      if (conditionPattern.test(line)) {
        bugs.push({
          type: 'comparison-error',
          line: index,
          code: '= instead of ==',
          context: line.trim(),
        });
      }

      // Pattern: == instead of === (loose equality)
      // Only flag if it looks like a comparison, not part of ===
      const looseEquality = /[^=!]==[^=]/;
      if (looseEquality.test(line) && !line.includes('===')) {
        bugs.push({
          type: 'comparison-error',
          line: index,
          code: '==',
          context: line.trim(),
        });
      }
    });

    return bugs;
  },
};

/**
 * Detect missing error handling.
 * Pattern: .catch not called on Promise, try without catch
 */
const errorHandlingDetector: DetectorConfig = {
  type: 'missing-error-handling',
  description: 'Missing error handling',
  languages: ['typescript', 'javascript'],
  severity: 'info',
  confidence: 0.6,
  suggestion: 'Add error handling with try/catch or .catch() for promises.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    lines.forEach((line, index) => {
      // Detect fetch/axios without .catch
      if ((line.includes('fetch(') || line.includes('axios.')) &&
          !line.includes('.catch') &&
          !lines.slice(index, index + 3).some(l => l.includes('.catch'))) {
        bugs.push({
          type: 'missing-error-handling',
          line: index,
          code: 'fetch/axios without .catch',
          context: line.trim(),
        });
      }

      // Detect try without catch (empty catch or no catch)
      if (line.includes('try {') || line.includes('try{')) {
        const nextLines = lines.slice(index, index + 10).join('\n');
        if (!nextLines.includes('catch')) {
          bugs.push({
            type: 'missing-error-handling',
            line: index,
            code: 'try without catch',
            context: line.trim(),
          });
        }
      }
    });

    return bugs;
  },
};

/**
 * Detect potential infinite loops.
 * Pattern: while(true) without break, loop variable not modified
 */
const infiniteLoopDetector: DetectorConfig = {
  type: 'infinite-loop',
  description: 'Potential infinite loop',
  languages: ['typescript', 'javascript', 'python', 'java'],
  severity: 'error',
  confidence: 0.7,
  suggestion: 'Ensure loop has a valid exit condition and the loop variable is modified.',
  detect: (code, lines) => {
    const bugs: DetectedBug[] = [];

    lines.forEach((line, index) => {
      // Pattern: while(true) or while(1)
      if (/while\s*\(\s*(true|1)\s*\)/.test(line)) {
        // Check if there's a break in the next 20 lines
        const loopBody = lines.slice(index, index + 20).join('\n');
        if (!loopBody.includes('break') && !loopBody.includes('return')) {
          bugs.push({
            type: 'infinite-loop',
            line: index,
            code: 'while(true)',
            context: line.trim(),
          });
        }
      }

      // Pattern: for loop where counter isn't modified
      const forMatch = line.match(/for\s*\(\s*\w+\s+(\w+)\s*=/);
      if (forMatch) {
        const loopVar = forMatch[1];
        const loopBody = lines.slice(index, index + 10).join('\n');
        const modifyPattern = new RegExp(`${loopVar}\\s*(\\+\\+|--|\\+=|-=|=)`);
        if (!modifyPattern.test(loopBody)) {
          bugs.push({
            type: 'infinite-loop',
            line: index,
            code: `loop variable '${loopVar}' not modified`,
            context: line.trim(),
          });
        }
      }
    });

    return bugs;
  },
};

// =============================================================================
// Detector Registry
// =============================================================================

/**
 * All available detectors
 */
const ALL_DETECTORS: DetectorConfig[] = [
  undefinedAccessDetector,
  nullReferenceDetector,
  asyncAwaitDetector,
  offByOneDetector,
  comparisonDetector,
  errorHandlingDetector,
  infiniteLoopDetector,
];

// =============================================================================
// Public API
// =============================================================================

/**
 * BugDetector class - runs all applicable detectors on code.
 *
 * Usage:
 * ```typescript
 * const detector = new BugDetector();
 * const bugs = detector.detect(code, 'typescript');
 * const warnings = detector.getWarnings(code, 'typescript');
 * ```
 */
export class BugDetector {
  private detectors: DetectorConfig[];

  constructor() {
    this.detectors = ALL_DETECTORS;
  }

  /**
   * Detect potential bugs in code.
   *
   * @param code - Source code to analyze
   * @param language - Programming language
   * @returns Array of detected bugs
   */
  detect(code: string, language: SupportedLanguage | string): DetectedBug[] {
    const lines = code.split('\n');
    const bugs: DetectedBug[] = [];

    for (const detector of this.detectors) {
      // Skip if detector doesn't apply to this language
      if (!detector.languages.includes(language as SupportedLanguage)) {
        continue;
      }

      try {
        const detected = detector.detect(code, lines);
        bugs.push(...detected);
      } catch (error) {
        // Don't let one detector failure break the whole scan
        console.error(`[BugDetector] ${detector.type} failed:`, error);
      }
    }

    return bugs;
  }

  /**
   * Get warnings formatted for UI display.
   *
   * @param code - Source code to analyze
   * @param language - Programming language
   * @param minConfidence - Minimum confidence threshold (default: 0.6)
   * @returns Array of warnings with suggestions
   */
  getWarnings(
    code: string,
    language: SupportedLanguage | string,
    minConfidence: number = 0.6
  ): Warning[] {
    const bugs = this.detect(code, language);
    const warnings: Warning[] = [];

    for (const bug of bugs) {
      const detector = this.detectors.find(d => d.type === bug.type);
      if (!detector) continue;

      // Skip low confidence detections
      if (detector.confidence < minConfidence) continue;

      warnings.push({
        type: bug.type,
        severity: detector.severity,
        message: detector.description,
        line: bug.line,
        suggestion: detector.suggestion,
        confidence: detector.confidence,
        preventable: true,
      });
    }

    // Deduplicate warnings on same line with same type
    const unique = new Map<string, Warning>();
    for (const warning of warnings) {
      const key = `${warning.line}:${warning.type}`;
      if (!unique.has(key)) {
        unique.set(key, warning);
      }
    }

    return Array.from(unique.values());
  }

  /**
   * Get list of supported bug types.
   */
  getSupportedTypes(): string[] {
    return this.detectors.map(d => d.type);
  }

  /**
   * Get detector info for a specific bug type.
   */
  getDetectorInfo(type: string): DetectorConfig | undefined {
    return this.detectors.find(d => d.type === type);
  }
}
