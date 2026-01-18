/**
 * DebugDuck API Layer
 *
 * Clean, unified API for the frontend (VS Code extension UI) to consume.
 * Orchestrates all backend modules: hints, patterns, prevention, storage.
 *
 * @module api
 */

import type {
  Bug,
  AnalysisResult,
  HintResponse,
  LearningSession,
  LearningProfile,
  Warning,
  DashboardData,
  PatternStat,
  WeeklyProgress,
  Achievement,
  LearningInsight,
  DebugDuckConfig,
  DEFAULT_CONFIG,
} from "../types";
import { ProgressiveHintSystem } from "../learningEngine/hintSystem";
import { PatternTracker } from "../learningEngine/patternTracker";
import { PreventionEngine } from "../learningEngine/preventionEngine";
import { FileStorageAdapter } from "../storage/fileStorage";
// NOTE: LocalDB uses bun:sqlite which is not available in VS Code's Node.js runtime
// Keeping the file for future use when VS Code supports it or for CLI tools
// import { LocalDB } from "../storage/localDB";

// =============================================================================
// Types
// =============================================================================

/**
 * Storage type options
 */
export type StorageType = "json" | "sqlite";

/**
 * Configuration for DebugDuckEngine
 */
export interface EngineConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Base directory for storage (default: '.debugduck') */
  baseDir?: string;
  /** Storage type: 'json' (default) or 'sqlite' */
  storageType?: StorageType;
  /** User ID (defaults to 'default-user') */
  userId?: string;
  /** Maximum hints per session */
  maxHints?: number;
  /** Minimum confidence for warnings */
  minWarningConfidence?: number;
  /** Enable real-time warnings */
  enableRealTimeWarnings?: boolean;
  /** Warning debounce in ms */
  warningDebounceMs?: number;
}

/**
 * Result of analyzing code selection
 */
export interface SelectionAnalysis {
  sessionId: string;
  firstHint: HintResponse;
  bugType: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  learningObjective: string;
}

/**
 * Give up result with solution
 */
export interface GiveUpResult {
  solution: string;
  session: LearningSession;
  encouragement: string;
}

// =============================================================================
// DebugDuckEngine Class
// =============================================================================

/**
 * Main API for DebugDuck extension.
 *
 * Usage:
 * ```typescript
 * const engine = new DebugDuckEngine({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   dbPath: '.debugduck/debugduck.db',
 * });
 *
 * // Analyze selected code
 * const result = await engine.analyzeSelection(code, 'typescript');
 *
 * // Get next hint
 * const hint = await engine.getNextHint(result.sessionId);
 *
 * // Mark as solved
 * await engine.markSolved(result.sessionId);
 *
 * // Get real-time warnings
 * const warnings = await engine.getWarnings(code, 'typescript');
 *
 * // Get dashboard data
 * const dashboard = await engine.getDashboardData();
 *
 * // Cleanup
 * engine.close();
 * ```
 */
export class DebugDuckEngine {
  private hintSystem: ProgressiveHintSystem;
  private patternTracker: PatternTracker;
  private preventionEngine: PreventionEngine;
  private storage: FileStorageAdapter;
  private userId: string;
  private config: EngineConfig;
  private profile: LearningProfile;

  constructor(config: EngineConfig) {
    this.config = config;
    this.userId = config.userId ?? "default-user";
    const baseDir = config.baseDir ?? ".debugduck";

    // Initialize JSON file storage (SQLite not available in VS Code Node.js runtime)
    this.storage = new FileStorageAdapter({ baseDir });

    // JSON mode - profile loaded async, start with empty
    this.profile = {
      userId: this.userId,
      totalBugs: 0,
      bugsSolved: 0,
      bugsGaveUp: 0,
      averageHintsPerBug: 0,
      patterns: new Map(),
      strengths: [],
      weaknesses: [],
      streak: 0,
      lastActive: new Date(),
      createdAt: new Date(),
    };
    // Load profile asynchronously
    this.loadProfile();

    // Initialize components
    this.hintSystem = new ProgressiveHintSystem(config.apiKey, {
      maxHints: config.maxHints ?? 4,
    });

    this.patternTracker = new PatternTracker(this.profile);

    this.preventionEngine = new PreventionEngine(this.patternTracker, {
      minConfidence: config.minWarningConfidence ?? 0.6,
      debounceMs: config.warningDebounceMs ?? 1000,
      boostRepeatPatterns: true,
    });
  }

  /**
   * Load profile from JSON storage (async).
   */
  private async loadProfile(): Promise<void> {
    const loaded = await this.storage.getOrCreateProfile(this.userId);
    this.profile = loaded;
    // Update pattern tracker with loaded profile
    this.patternTracker = new PatternTracker(this.profile);
    this.preventionEngine.setPatternTracker(this.patternTracker);
  }

  // ===========================================================================
  // Hint Session API
  // ===========================================================================

  /**
   * Analyze selected code and start a hint session.
   *
   * @param code - The code to analyze
   * @param language - Programming language
   * @param errorMessage - Optional error message
   * @param lineNumber - Optional line number
   * @param fileName - Optional file name
   * @returns Analysis result with first hint
   */
  async analyzeSelection(
    code: string,
    language: string,
    errorMessage?: string,
    lineNumber?: number,
    fileName?: string,
  ): Promise<SelectionAnalysis> {
    const bug: Bug = {
      code,
      language,
      errorMessage,
      lineNumber,
      fileName,
    };

    const result = await this.hintSystem.analyzeBug(bug);

    // Get first hint
    const firstHintResult = await this.hintSystem.getNextHint(result.sessionId);

    // Provide a default if no hint (shouldn't happen, but be safe)
    const firstHint: HintResponse = firstHintResult ?? {
      type: "hint",
      content: "Let me analyze this code for you...",
      progress: "Hint 1/4",
      encouragement: "Take your time to think about it!",
      isLastHint: false,
    };

    return {
      sessionId: result.sessionId,
      firstHint,
      bugType: result.bugType,
      difficulty: result.difficulty,
      learningObjective: result.learningObjective,
    };
  }

  /**
   * Get the next hint for a session.
   *
   * @param sessionId - Session ID
   * @returns Next hint or solution if no more hints
   */
  async getNextHint(sessionId: string): Promise<HintResponse> {
    const hint = await this.hintSystem.getNextHint(sessionId);

    // If no more hints, return a "no more hints" response
    if (!hint) {
      return {
        type: "solution",
        content:
          "No more hints available. Try solving it or give up to see the solution.",
        progress: "Complete",
        encouragement: "You've seen all the hints. You can do this!",
        isLastHint: true,
      };
    }

    return hint;
  }

  /**
   * Mark a session as solved by the user.
   *
   * @param sessionId - Session ID
   * @returns Completed session
   */
  async markSolved(sessionId: string): Promise<LearningSession> {
    try {
      const session = await this.hintSystem.markSolved(sessionId);

      // Record in pattern tracker
      this.patternTracker.recordSession(session);

      // Save session to storage (don't let storage errors block success)
      try {
        await this.saveSession(session);
        await this.saveProfile();
      } catch (storageError) {
        console.error("DebugDuck: Storage error (non-fatal):", storageError);
      }

      return session;
    } catch (error) {
      console.error("DebugDuck: markSolved error:", error);
      throw error;
    }
  }

  /**
   * Give up on a session and get the solution.
   *
   * @param sessionId - Session ID
   * @returns Solution and completed session
   */
  async giveUp(sessionId: string): Promise<GiveUpResult> {
    try {
      const result = await this.hintSystem.giveUp(sessionId);

      // Record in pattern tracker
      this.patternTracker.recordSession(result.session);

      // Save session to storage (don't let storage errors block success)
      try {
        await this.saveSession(result.session);
        await this.saveProfile();
      } catch (storageError) {
        console.error("DebugDuck: Storage error (non-fatal):", storageError);
      }

      return {
        solution: result.solution,
        session: result.session,
        encouragement:
          "Don't worry! Every bug is a learning opportunity. You'll get the next one!",
      };
    } catch (error) {
      console.error("DebugDuck: giveUp error:", error);
      throw error;
    }
  }

  /**
   * Get current session state.
   *
   * @param sessionId - Session ID
   * @returns Session state or null if not found
   */
  getSessionState(sessionId: string): {
    hintsRevealed: number;
    totalHints: number;
    isComplete: boolean;
  } | null {
    try {
      return this.hintSystem.getSessionState(sessionId);
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Real-time Warnings API
  // ===========================================================================

  /**
   * Get warnings for code (real-time prevention).
   *
   * @param code - Code to analyze
   * @param language - Programming language
   * @returns Array of warnings
   */
  async getWarnings(code: string, language: string): Promise<Warning[]> {
    const result = await this.preventionEngine.analyzeCode(code, language, {
      force: true,
    });
    return result.warnings;
  }

  /**
   * Schedule a debounced warning analysis.
   * Use this for real-time typing scenarios.
   *
   * @param code - Code to analyze
   * @param language - Programming language
   * @param callback - Called with warnings when analysis completes
   */
  scheduleWarningAnalysis(
    code: string,
    language: string,
    callback: (warnings: Warning[]) => void,
  ): void {
    this.preventionEngine.scheduleAnalysis(code, language, (result) => {
      callback(result.warnings);
    });
  }

  /**
   * Cancel any pending warning analysis.
   */
  cancelPendingAnalysis(): void {
    this.preventionEngine.cancelPendingAnalysis();
  }

  /**
   * Get warnings for a specific line.
   *
   * @param line - Line number (0-indexed)
   * @returns Warnings on that line
   */
  getWarningsForLine(line: number): Warning[] {
    return this.preventionEngine.getWarningsForLine(line);
  }

  // ===========================================================================
  // Dashboard API
  // ===========================================================================

  /**
   * Get dashboard data for the progress view.
   *
   * @returns Complete dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const profile = this.patternTracker.getProfile();

    // Get recent sessions from storage
    const recentSessions = await this.getRecentSessions(10);

    // Calculate pattern stats
    const patternStats = this.getPatternStats();

    // Calculate weekly progress
    const weeklyProgress = await this.calculateWeeklyProgress();

    // Get achievements
    const achievements = this.calculateAchievements(profile);

    // Calculate improvements
    const improvements = this.calculateImprovements();

    return {
      totalBugs: profile.totalBugs,
      bugsSolved: profile.bugsSolved,
      solveRate:
        profile.totalBugs > 0 ? profile.bugsSolved / profile.totalBugs : 0,
      averageHintsNeeded: profile.averageHintsPerBug,
      streak: profile.streak,
      topPatterns: patternStats,
      recentSessions,
      improvements,
      weeklyProgress,
      achievements,
    };
  }

  /**
   * Get learning insights.
   *
   * @returns Array of insights
   */
  getInsights(): LearningInsight[] {
    return this.patternTracker.getInsights();
  }

  /**
   * Get pattern statistics.
   *
   * @returns Array of pattern stats
   */
  getPatternStats(): PatternStat[] {
    const stats = this.patternTracker.getPatternStats();

    return stats.map((stat) => ({
      type: stat.type,
      count: stat.occurrences,
      averageHints: stat.averageHintsNeeded,
      trend: stat.improving ? "improving" : "stable",
    }));
  }

  // ===========================================================================
  // Profile API
  // ===========================================================================

  /**
   * Get the current user profile.
   *
   * @returns User's learning profile
   */
  getProfile(): LearningProfile {
    return this.patternTracker.getProfile();
  }

  /**
   * Get user's strengths (bug types they handle well).
   *
   * @returns Array of bug type strings
   */
  getStrengths(): string[] {
    return this.patternTracker.getProfile().strengths;
  }

  /**
   * Get user's weaknesses (bug types they struggle with).
   *
   * @returns Array of bug type strings
   */
  getWeaknesses(): string[] {
    return this.patternTracker.getProfile().weaknesses;
  }

  /**
   * Reset all user progress.
   * Use with caution!
   */
  async resetProgress(): Promise<void> {
    await this.storage.deleteProfile();
    this.profile = await this.storage.getOrCreateProfile(this.userId);
    this.patternTracker = new PatternTracker(this.profile);
    this.preventionEngine.setPatternTracker(this.patternTracker);
  }

  // ===========================================================================
  // Session History API
  // ===========================================================================

  /**
   * Get recent sessions.
   *
   * @param limit - Maximum number of sessions
   * @returns Array of sessions
   */
  async getRecentSessions(limit: number = 10): Promise<LearningSession[]> {
    return this.storage.getRecentSessions(limit);
  }

  /**
   * Get sessions by bug type.
   *
   * @param bugType - Bug type to filter by
   * @param limit - Maximum number of sessions
   * @returns Array of sessions
   */
  async getSessionsByBugType(
    bugType: string,
    limit: number = 20,
  ): Promise<LearningSession[]> {
    return this.storage.getSessions({ bugType, limit });
  }

  /**
   * Get session by ID.
   *
   * @param sessionId - Session ID
   * @returns Session or null
   */
  async getSession(sessionId: string): Promise<LearningSession | null> {
    return this.storage.getSession(sessionId);
  }

  /**
   * Get total session count.
   *
   * @returns Number of sessions
   */
  async getSessionCount(): Promise<number> {
    return this.storage.getSessionCount();
  }

  // ===========================================================================
  // Configuration API
  // ===========================================================================

  /**
   * Get current configuration.
   *
   * @returns Current config
   */
  async getConfig(): Promise<Partial<DebugDuckConfig> | null> {
    return this.storage.getConfig();
  }

  /**
   * Save configuration.
   *
   * @param config - Config to save
   */
  async saveUserConfig(config: Partial<DebugDuckConfig>): Promise<void> {
    await this.storage.saveConfig(config);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Close the engine and release resources.
   */
  close(): void {
    this.preventionEngine.cancelPendingAnalysis();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Save a session to storage.
   */
  private async saveSession(session: LearningSession): Promise<void> {
    await this.storage.saveSession(session);
  }

  /**
   * Save current profile to storage.
   */
  private async saveProfile(): Promise<void> {
    const profile = this.patternTracker.getProfile();
    await this.storage.saveProfile(profile);
  }

  /**
   * Calculate weekly progress data.
   */
  private async calculateWeeklyProgress(): Promise<WeeklyProgress> {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const bugsFixed: number[] = [];
    const hintsUsed: number[] = [];

    // Get sessions from the last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sessions = await this.storage.getSessions({
      startDate: weekAgo,
      endDate: now,
    });

    // Group by day of week
    const byDay = new Map<number, LearningSession[]>();
    for (const session of sessions) {
      const day = new Date(session.timestamp).getDay();
      const adjustedDay = day === 0 ? 6 : day - 1; // Convert to Mon=0, Sun=6
      const existing = byDay.get(adjustedDay) ?? [];
      existing.push(session);
      byDay.set(adjustedDay, existing);
    }

    // Calculate stats per day
    for (let i = 0; i < 7; i++) {
      const daySessions = byDay.get(i) ?? [];
      const solved = daySessions.filter((s) => s.solved).length;
      const hints = daySessions.reduce((sum, s) => sum + s.hintsNeeded, 0);
      bugsFixed.push(solved);
      hintsUsed.push(hints);
    }

    return { days, bugsFixed, hintsUsed };
  }

  /**
   * Calculate achievements.
   */
  private calculateAchievements(profile: LearningProfile): Achievement[] {
    const achievements: Achievement[] = [
      {
        id: "first-bug",
        name: "First Bug",
        description: "Fix your first bug",
        icon: "🐛",
        requirement: 1,
        progress: Math.min(profile.bugsSolved / 1, 1),
        unlockedAt: profile.bugsSolved >= 1 ? profile.createdAt : undefined,
      },
      {
        id: "bug-hunter",
        name: "Bug Hunter",
        description: "Fix 10 bugs",
        icon: "🔍",
        requirement: 10,
        progress: Math.min(profile.bugsSolved / 10, 1),
        unlockedAt: profile.bugsSolved >= 10 ? new Date() : undefined,
      },
      {
        id: "bug-slayer",
        name: "Bug Slayer",
        description: "Fix 50 bugs",
        icon: "⚔️",
        requirement: 50,
        progress: Math.min(profile.bugsSolved / 50, 1),
        unlockedAt: profile.bugsSolved >= 50 ? new Date() : undefined,
      },
      {
        id: "streak-3",
        name: "On Fire",
        description: "3 day streak",
        icon: "🔥",
        requirement: 3,
        progress: Math.min(profile.streak / 3, 1),
        unlockedAt: profile.streak >= 3 ? new Date() : undefined,
      },
      {
        id: "streak-7",
        name: "Week Warrior",
        description: "7 day streak",
        icon: "💪",
        requirement: 7,
        progress: Math.min(profile.streak / 7, 1),
        unlockedAt: profile.streak >= 7 ? new Date() : undefined,
      },
      {
        id: "quick-learner",
        name: "Quick Learner",
        description: "Average less than 2 hints per bug",
        icon: "🧠",
        requirement: 2,
        progress:
          profile.averageHintsPerBug > 0
            ? Math.min(2 / profile.averageHintsPerBug, 1)
            : 0,
        unlockedAt:
          profile.averageHintsPerBug > 0 && profile.averageHintsPerBug < 2
            ? new Date()
            : undefined,
      },
    ];

    return achievements;
  }

  /**
   * Calculate improvement statistics.
   */
  private calculateImprovements(): Array<{
    type: string;
    oldAverage: number;
    newAverage: number;
    improvement: number;
    sessions: number;
  }> {
    const improvements: Array<{
      type: string;
      oldAverage: number;
      newAverage: number;
      improvement: number;
      sessions: number;
    }> = [];

    const profile = this.patternTracker.getProfile();

    for (const [type, pattern] of profile.patterns) {
      if (pattern.occurrences >= 4 && pattern.improving) {
        // Estimate old vs new average (simplified)
        const oldAverage = pattern.averageHintsNeeded * 1.3;
        const newAverage = pattern.averageHintsNeeded;
        const improvement = ((oldAverage - newAverage) / oldAverage) * 100;

        improvements.push({
          type,
          oldAverage,
          newAverage,
          improvement,
          sessions: pattern.occurrences,
        });
      }
    }

    return improvements.sort((a, b) => b.improvement - a.improvement);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new DebugDuckEngine instance.
 *
 * @param apiKey - Anthropic API key
 * @param options - Optional configuration
 * @returns New engine instance
 */
export function createEngine(
  apiKey: string,
  options?: Omit<EngineConfig, "apiKey">,
): DebugDuckEngine {
  return new DebugDuckEngine({
    apiKey,
    ...options,
  });
}

// =============================================================================
// Exports
// =============================================================================

export type {
  Bug,
  AnalysisResult,
  HintResponse,
  LearningSession,
  LearningProfile,
  Warning,
  DashboardData,
  PatternStat,
  LearningInsight,
  DebugDuckConfig,
};
