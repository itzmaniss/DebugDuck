/**
 * PreventionEngine - Real-time Code Analysis
 *
 * Orchestrates bug detection and personalized warnings.
 * Runs on code changes (debounced) to provide proactive feedback.
 *
 * Features:
 * 1. Combines static detection (BugDetector) with learning (PatternTracker)
 * 2. Personalized warnings based on user's history
 * 3. Debouncing to avoid spamming during typing
 * 4. Confidence boosting for repeat mistakes
 *
 * @module learningEngine/preventionEngine
 */

import type { Warning, SupportedLanguage } from '../types';
import { BugDetector } from './bugDetectors';
import { PatternTracker } from './patternTracker';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for PreventionEngine
 */
export interface PreventionEngineOptions {
  /** Minimum confidence to show warning (0-1, default: 0.6) */
  minConfidence?: number;
  /** Debounce delay in ms (default: 1000) */
  debounceMs?: number;
  /** Boost confidence for patterns user struggles with */
  boostRepeatPatterns?: boolean;
}

/**
 * Result of code analysis
 */
export interface AnalysisResult {
  /** Detected warnings */
  warnings: Warning[];
  /** Time taken to analyze (ms) */
  analysisTimeMs: number;
  /** Whether analysis was debounced/skipped */
  skipped: boolean;
}

// =============================================================================
// PreventionEngine Class
// =============================================================================

/**
 * Real-time code analysis engine with personalized warnings.
 *
 * Usage:
 * ```typescript
 * const engine = new PreventionEngine(patternTracker);
 *
 * // Analyze code (debounced)
 * const result = await engine.analyzeCode(code, 'typescript');
 *
 * // Force immediate analysis (bypass debounce)
 * const result = await engine.analyzeCode(code, 'typescript', { force: true });
 * ```
 */
export class PreventionEngine {
  private detector: BugDetector;
  private tracker: PatternTracker | null;
  private options: Required<PreventionEngineOptions>;

  /** Last analysis timestamp for debouncing */
  private lastAnalysis: number = 0;

  /** Pending debounce timer */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Cache of last analysis result */
  private lastResult: AnalysisResult | null = null;

  /** Hash of last analyzed code (for cache invalidation) */
  private lastCodeHash: string = '';

  constructor(
    patternTracker?: PatternTracker,
    options?: PreventionEngineOptions
  ) {
    this.detector = new BugDetector();
    this.tracker = patternTracker ?? null;
    this.options = {
      minConfidence: options?.minConfidence ?? 0.6,
      debounceMs: options?.debounceMs ?? 1000,
      boostRepeatPatterns: options?.boostRepeatPatterns ?? true,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Analyze code for potential bugs.
   *
   * By default, this is debounced to avoid excessive processing
   * during typing. Use `force: true` to bypass debouncing.
   *
   * @param code - Source code to analyze
   * @param language - Programming language
   * @param options - Analysis options
   * @returns Analysis result with warnings
   */
  async analyzeCode(
    code: string,
    language: SupportedLanguage | string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult> {
    const now = Date.now();
    const codeHash = this.hashCode(code);

    // Return cached result if code hasn't changed
    if (codeHash === this.lastCodeHash && this.lastResult) {
      return { ...this.lastResult, skipped: true };
    }

    // Check debounce (unless forced)
    if (!options?.force) {
      const timeSinceLastAnalysis = now - this.lastAnalysis;
      if (timeSinceLastAnalysis < this.options.debounceMs) {
        return {
          warnings: this.lastResult?.warnings ?? [],
          analysisTimeMs: 0,
          skipped: true,
        };
      }
    }

    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Perform analysis
    const startTime = performance.now();
    const warnings = this.performAnalysis(code, language);
    const analysisTimeMs = Math.round(performance.now() - startTime);

    // Cache result
    this.lastAnalysis = now;
    this.lastCodeHash = codeHash;
    this.lastResult = {
      warnings,
      analysisTimeMs,
      skipped: false,
    };

    return this.lastResult;
  }

  /**
   * Schedule a debounced analysis.
   *
   * Use this for real-time typing scenarios where you want
   * to wait for the user to pause before analyzing.
   *
   * @param code - Source code to analyze
   * @param language - Programming language
   * @param callback - Called with results when analysis completes
   */
  scheduleAnalysis(
    code: string,
    language: SupportedLanguage | string,
    callback: (result: AnalysisResult) => void
  ): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new analysis
    this.debounceTimer = setTimeout(async () => {
      const result = await this.analyzeCode(code, language, { force: true });
      callback(result);
    }, this.options.debounceMs);
  }

  /**
   * Cancel any pending scheduled analysis.
   */
  cancelPendingAnalysis(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Get warnings for a specific line.
   * Useful for hover tooltips.
   *
   * @param line - Line number (0-indexed)
   * @returns Warnings on that line
   */
  getWarningsForLine(line: number): Warning[] {
    if (!this.lastResult) return [];
    return this.lastResult.warnings.filter(w => w.line === line);
  }

  /**
   * Get all current warnings.
   */
  getCurrentWarnings(): Warning[] {
    return this.lastResult?.warnings ?? [];
  }

  /**
   * Clear cached analysis results.
   * Call when switching files or clearing diagnostics.
   */
  clearCache(): void {
    this.lastResult = null;
    this.lastCodeHash = '';
    this.lastAnalysis = 0;
  }

  /**
   * Update the pattern tracker (e.g., after loading user profile).
   */
  setPatternTracker(tracker: PatternTracker): void {
    this.tracker = tracker;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Perform the actual analysis.
   */
  private performAnalysis(
    code: string,
    language: SupportedLanguage | string
  ): Warning[] {
    // Get base warnings from detector
    let warnings = this.detector.getWarnings(
      code,
      language,
      this.options.minConfidence
    );

    // Enhance with pattern tracker data
    if (this.tracker && this.options.boostRepeatPatterns) {
      warnings = this.enhanceWithPatternData(warnings);
    }

    // Sort by severity and line number
    warnings.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.line - b.line;
    });

    return warnings;
  }

  /**
   * Enhance warnings with personalized data from pattern tracker.
   */
  private enhanceWithPatternData(warnings: Warning[]): Warning[] {
    if (!this.tracker) return warnings;

    return warnings.map(warning => {
      // Check if user has history with this bug type
      const personalWarning = this.tracker!.shouldWarn(warning.type);

      if (personalWarning) {
        // Boost confidence for repeat patterns
        const boostedConfidence = Math.min(warning.confidence + 0.15, 1.0);

        return {
          ...warning,
          confidence: boostedConfidence,
          preventable: true,
          // Prepend personal warning to message
          message: `${personalWarning} ${warning.message}`,
        };
      }

      return warning;
    });
  }

  /**
   * Simple hash function for cache key.
   */
  private hashCode(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }
}
