/**
 * PatternTracker - Bug Pattern Recognition and Learning Analytics
 *
 * Tracks user's debugging patterns over time to:
 * 1. Identify recurring bug types (weaknesses)
 * 2. Detect improvement trends (getting better)
 * 3. Generate insights for the dashboard
 * 4. Trigger proactive warnings for repeat mistakes
 *
 * This is the "learning" in "learning to debug" - it remembers
 * what bugs you struggle with and helps you improve.
 *
 * @module learningEngine/patternTracker
 */

import type {
  LearningSession,
  LearningProfile,
  BugPattern,
  LearningInsight,
  PatternStat,
  ImprovementStat,
} from "../types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum sessions needed before generating insights.
 * Prevents premature conclusions from small sample sizes.
 */
const MIN_SESSIONS_FOR_INSIGHTS = 3;

/**
 * Number of recent sessions to use for trend analysis.
 * Compares recent performance vs overall average.
 */
const RECENT_WINDOW_SIZE = 5;

/**
 * Threshold for "improving" status.
 * User is improving if recent avg hints < overall avg by this ratio.
 */
const IMPROVEMENT_THRESHOLD = 0.8; // 20% fewer hints = improving

// =============================================================================
// PatternTracker Class
// =============================================================================

/**
 * Tracks and analyzes user's debugging patterns over time.
 *
 * Usage:
 * ```typescript
 * const tracker = new PatternTracker();
 *
 * // Record completed sessions
 * tracker.recordSession(session);
 *
 * // Get insights
 * const insights = tracker.getInsights();
 *
 * // Check for repeat patterns
 * const warning = tracker.shouldWarn('undefined-access');
 * ```
 */
export class PatternTracker {
  /**
   * All recorded sessions, ordered by timestamp.
   * Used for trend analysis and history.
   */
  private sessions: LearningSession[] = [];

  /**
   * Bug patterns indexed by type.
   * Aggregated stats for each bug type encountered.
   */
  private patterns: Map<string, BugPattern> = new Map();

  /**
   * User's learning profile.
   * Aggregated stats across all sessions.
   */
  private profile: LearningProfile;

  /**
   * @param existingProfile - Load existing profile (from storage) to preserve userId and history
   * @param userId - Optional userId for new profiles (if not provided, will be generated once)
   */
  constructor(existingProfile?: LearningProfile, userId?: string) {
    if (existingProfile) {
      // Restore from existing profile - preserves userId
      this.profile = existingProfile;
      this.patterns = new Map(existingProfile.patterns);
    } else {
      // New user - generate userId once (should be persisted by storage layer)
      this.profile = this.createEmptyProfile(userId);
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Record a completed debugging session.
   *
   * Updates:
   * - Session history
   * - Pattern statistics for the bug type
   * - Overall profile metrics
   * - Streak tracking
   *
   * @param session - The completed learning session
   */
  recordSession(session: LearningSession): void {
    // Add to session history
    this.sessions.push(session);

    // Update pattern for this bug type
    this.updatePattern(session);

    // Update overall profile
    this.updateProfile(session);

    console.log(
      `[PatternTracker] Recorded session: ${session.bugType} ` +
        `(${session.solved ? "solved" : "gave up"}, ${session.hintsNeeded} hints)`,
    );
  }

  /**
   * Get insights based on accumulated patterns.
   *
   * Returns actionable insights like:
   * - "You're improving at undefined-access bugs!"
   * - "You struggle with async-await - review this concept"
   * - "3-day streak! Keep it up!"
   *
   * @returns Array of learning insights
   */
  getInsights(): LearningInsight[] {
    const insights: LearningInsight[] = [];

    // Not enough data yet
    if (this.sessions.length < MIN_SESSIONS_FOR_INSIGHTS) {
      return [
        {
          type: "suggestion",
          message: `Debug ${MIN_SESSIONS_FOR_INSIGHTS - this.sessions.length} more bugs to unlock insights!`,
        },
      ];
    }

    // Check for improvements
    for (const [bugType, pattern] of this.patterns) {
      if (pattern.occurrences >= MIN_SESSIONS_FOR_INSIGHTS) {
        if (pattern.improving) {
          insights.push({
            type: "improvement",
            message: `You're getting better at ${this.formatBugType(bugType)} bugs!`,
            relatedPattern: bugType,
          });
        } else if (pattern.averageHintsNeeded > 3) {
          insights.push({
            type: "warning",
            message: `${this.formatBugType(bugType)} bugs are challenging for you.`,
            relatedPattern: bugType,
            actionable: "Review common causes of this bug type.",
          });
        }
      }
    }

    // Streak achievements
    if (this.profile.streak >= 7) {
      insights.push({
        type: "achievement",
        message: `Amazing! ${this.profile.streak}-day debugging streak!`,
      });
    } else if (this.profile.streak >= 3) {
      insights.push({
        type: "achievement",
        message: `${this.profile.streak}-day streak! Keep it up!`,
      });
    }

    // Overall improvement
    if (this.isOverallImproving()) {
      insights.push({
        type: "improvement",
        message: "Your debugging skills are improving overall!",
      });
    }

    return insights;
  }

  /**
   * Check if user should be warned about a bug type.
   *
   * Returns a warning if:
   * - User has seen this bug type 3+ times
   * - User typically needs 3+ hints for this type
   *
   * Used by prevention engine for proactive warnings.
   *
   * @param bugType - The bug type to check
   * @returns Warning message or null
   */
  shouldWarn(bugType: string): string | null {
    const pattern = this.patterns.get(bugType);

    if (!pattern) return null;

    if (pattern.occurrences >= 3 && pattern.averageHintsNeeded >= 3) {
      return (
        `You've made this type of mistake ${pattern.occurrences} times before. ` +
        `Take a closer look!`
      );
    }

    if (pattern.occurrences >= 5) {
      return (
        `This is a recurring pattern for you. Remember to check for ` +
        `${this.formatBugType(bugType)} issues.`
      );
    }

    return null;
  }

  /**
   * Get the current learning profile.
   */
  getProfile(): LearningProfile {
    return { ...this.profile };
  }

  /**
   * Get pattern statistics for dashboard display.
   */
  getPatternStats(): PatternStat[] {
    const stats: PatternStat[] = [];

    for (const [bugType, pattern] of this.patterns) {
      stats.push({
        type: bugType,
        count: pattern.occurrences,
        averageHints: pattern.averageHintsNeeded,
        trend: pattern.improving ? "improving" : "stable",
      });
    }

    // Sort by occurrence count (most common first)
    return stats.sort((a, b) => b.count - a.count);
  }

  /**
   * Get improvement statistics comparing recent vs overall performance.
   */
  getImprovementStats(): ImprovementStat[] {
    const stats: ImprovementStat[] = [];

    for (const [bugType, pattern] of this.patterns) {
      if (pattern.occurrences < RECENT_WINDOW_SIZE) continue;

      const recentSessions = this.getRecentSessionsForType(
        bugType,
        RECENT_WINDOW_SIZE,
      );
      if (recentSessions.length === 0) continue;

      const recentAvg = this.calculateAverageHints(recentSessions);
      const improvement =
        ((pattern.averageHintsNeeded - recentAvg) /
          pattern.averageHintsNeeded) *
        100;

      stats.push({
        type: bugType,
        oldAverage: pattern.averageHintsNeeded,
        newAverage: recentAvg,
        improvement: Math.round(improvement),
        sessions: recentSessions.length,
      });
    }

    return stats.sort((a, b) => b.improvement - a.improvement);
  }

  /**
   * Get list of user's strengths (bug types with low hint usage).
   */
  getStrengths(): string[] {
    return Array.from(this.patterns.entries())
      .filter(([_, p]) => p.occurrences >= 3 && p.averageHintsNeeded <= 2)
      .map(([type, _]) => type);
  }

  /**
   * Get list of user's weaknesses (bug types with high hint usage).
   */
  getWeaknesses(): string[] {
    return Array.from(this.patterns.entries())
      .filter(([_, p]) => p.occurrences >= 3 && p.averageHintsNeeded >= 3)
      .map(([type, _]) => type);
  }

  /**
   * Load sessions from storage (for restoring state).
   */
  loadSessions(sessions: LearningSession[]): void {
    this.sessions = sessions;

    // Rebuild patterns from sessions
    this.patterns.clear();
    for (const session of sessions) {
      this.updatePattern(session);
    }

    // Rebuild profile
    this.rebuildProfile();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Create an empty learning profile for new users.
   *
   * @param userId - Optional userId. If not provided, generates a stable one
   *                 based on random bytes (should be persisted by storage layer)
   */
  private createEmptyProfile(userId?: string): LearningProfile {
    return {
      userId: userId ?? this.generateUserId(),
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
  }

  /**
   * Update pattern statistics for a bug type.
   */
  private updatePattern(session: LearningSession): void {
    const existing = this.patterns.get(session.bugType);

    if (existing) {
      // Update existing pattern
      const totalHints =
        existing.averageHintsNeeded * existing.occurrences +
        session.hintsNeeded;
      existing.occurrences += 1;
      existing.averageHintsNeeded = totalHints / existing.occurrences;
      existing.lastSeen = session.timestamp;
      existing.improving = this.isPatternImproving(session.bugType);
    } else {
      // Create new pattern
      this.patterns.set(session.bugType, {
        type: session.bugType,
        occurrences: 1,
        firstSeen: session.timestamp,
        lastSeen: session.timestamp,
        averageHintsNeeded: session.hintsNeeded,
        improving: false,
        contexts: [],
      });
    }
  }

  /**
   * Update overall profile with session data.
   */
  private updateProfile(session: LearningSession): void {
    this.profile.totalBugs += 1;

    if (session.solved) {
      this.profile.bugsSolved += 1;
    } else {
      this.profile.bugsGaveUp += 1;
    }

    // Update running average of hints
    const totalHints =
      this.profile.averageHintsPerBug * (this.profile.totalBugs - 1) +
      session.hintsNeeded;
    this.profile.averageHintsPerBug = totalHints / this.profile.totalBugs;

    // Update streak
    this.updateStreak(session.timestamp);

    // Update strengths/weaknesses
    this.profile.strengths = this.getStrengths();
    this.profile.weaknesses = this.getWeaknesses();

    // Update patterns in profile
    this.profile.patterns = new Map(this.patterns);
    this.profile.lastActive = new Date();
  }

  /**
   * Update streak based on session timestamp.
   */
  private updateStreak(sessionDate: Date): void {
    const lastActive = this.profile.lastActive;
    const daysDiff = this.daysBetween(lastActive, sessionDate);

    if (daysDiff <= 1) {
      // Same day or next day - continue streak
      if (daysDiff === 1) {
        this.profile.streak += 1;
      }
      // Same day - streak unchanged
    } else {
      // Streak broken
      this.profile.streak = 1;
    }
  }

  /**
   * Check if user is improving at a specific bug type.
   */
  private isPatternImproving(bugType: string): boolean {
    const recentSessions = this.getRecentSessionsForType(
      bugType,
      RECENT_WINDOW_SIZE,
    );

    if (recentSessions.length < RECENT_WINDOW_SIZE) {
      return false;
    }

    const pattern = this.patterns.get(bugType);
    if (!pattern) return false;

    const recentAvg = this.calculateAverageHints(recentSessions);
    return recentAvg < pattern.averageHintsNeeded * IMPROVEMENT_THRESHOLD;
  }

  /**
   * Check if user is improving overall.
   */
  private isOverallImproving(): boolean {
    if (this.sessions.length < RECENT_WINDOW_SIZE * 2) {
      return false;
    }

    const recentSessions = this.sessions.slice(-RECENT_WINDOW_SIZE);
    const recentAvg = this.calculateAverageHints(recentSessions);

    return recentAvg < this.profile.averageHintsPerBug * IMPROVEMENT_THRESHOLD;
  }

  /**
   * Get recent sessions for a specific bug type.
   */
  private getRecentSessionsForType(
    bugType: string,
    count: number,
  ): LearningSession[] {
    return this.sessions.filter((s) => s.bugType === bugType).slice(-count);
  }

  /**
   * Calculate average hints needed across sessions.
   */
  private calculateAverageHints(sessions: LearningSession[]): number {
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, s) => sum + s.hintsNeeded, 0);
    return total / sessions.length;
  }

  /**
   * Rebuild profile from sessions (used when loading from storage).
   */
  private rebuildProfile(): void {
    this.profile = this.createEmptyProfile();

    for (const session of this.sessions) {
      this.updateProfile(session);
    }
  }

  /**
   * Calculate days between two dates.
   */
  private daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    const d1 = new Date(date1).setHours(0, 0, 0, 0);
    const d2 = new Date(date2).setHours(0, 0, 0, 0);
    return Math.round(Math.abs(d2 - d1) / oneDay);
  }

  /**
   * Format bug type for display (e.g., "undefined-access" -> "Undefined Access").
   */
  private formatBugType(bugType: string): string {
    return bugType
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Get user ID placeholder.
   *
   * The actual user identity is handled by VS Code's globalState
   * which ties to the user's account (if signed in) or machine.
   * This is just a fallback identifier for the data structure.
   */
  private generateUserId(): string {
    return "local_user";
  }
}
