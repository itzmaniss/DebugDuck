/**
 * ProgressiveHintSystem - Manages Hint Sessions and Progression
 *
 * This is the core learning engine that controls how hints are revealed
 * to users. It tracks active sessions, manages hint progression, and
 * records outcomes for learning analytics.
 *
 * Design Philosophy:
 * - Users learn best when they struggle a bit before getting help
 * - Progressive hints guide without giving away the answer
 * - Session tracking enables pattern analysis and improvement metrics
 *
 * @module learningEngine/hintSystem
 */

import type {
  Bug,
  AnalysisResult,
  HintLevel,
  HintResponse,
  LearningSession,
  HintPanelState,
} from '../types';
import { ClaudeClient } from '../ai/claude';
import { getEncouragement } from '../ai/prompts';

// =============================================================================
// Types
// =============================================================================

/**
 * Internal session state tracking more than what's exposed to UI
 */
interface ActiveSession {
  /** Unique session identifier */
  id: string;
  /** Original bug being debugged */
  bug: Bug;
  /** All hints for this bug (from Claude) */
  allHints: HintLevel[];
  /** Index of current hint (0-based) */
  currentHintIndex: number;
  /** Bug type classification */
  bugType: string;
  /** When session started */
  startTime: Date;
  /** Session outcome */
  status: 'active' | 'solved' | 'gave_up';
}

// =============================================================================
// ProgressiveHintSystem Class
// =============================================================================

/**
 * Manages progressive hint delivery for debugging sessions.
 *
 * Lifecycle:
 * 1. analyzeBug() - Start session, get hints from Claude
 * 2. getNextHint() - Reveal hints one at a time
 * 3. markSolved() or giveUp() - End session, record outcome
 *
 * @example
 * ```typescript
 * const hintSystem = new ProgressiveHintSystem(apiKey);
 *
 * // Start a session
 * const result = await hintSystem.analyzeBug({
 *   code: 'const x = arr[i].name;',
 *   language: 'typescript'
 * });
 *
 * // Get progressive hints
 * const hint1 = await hintSystem.getNextHint(result.sessionId);
 * const hint2 = await hintSystem.getNextHint(result.sessionId);
 *
 * // User solved it!
 * const session = await hintSystem.markSolved(result.sessionId);
 * ```
 */
export class ProgressiveHintSystem {
  private claude: ClaudeClient;

  /**
   * Active sessions: sessionId -> session state
   * Sessions are kept in memory during active debugging
   */
  private sessions: Map<string, ActiveSession> = new Map();

  /**
   * Max hints before forcing solution reveal
   * Configurable per instance (default: 4)
   */
  private readonly maxHints: number;

  constructor(apiKey: string, options?: { maxHints?: number }) {
    this.claude = new ClaudeClient(apiKey);
    this.maxHints = options?.maxHints ?? 4;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Analyze buggy code and start a new debugging session.
   *
   * This is the entry point for a debugging session:
   * 1. Sends code to Claude for analysis
   * 2. Creates internal session state
   * 3. Returns analysis result (but no hints revealed yet)
   *
   * @param bug - The bug context (code, language, error message)
   * @returns Analysis result with sessionId for subsequent calls
   */
  async analyzeBug(bug: Bug): Promise<AnalysisResult> {
    // Get hints from Claude
    const result = await this.claude.analyzeCode(bug, this.maxHints);

    // Create session state
    const session: ActiveSession = {
      id: result.sessionId,
      bug,
      allHints: result.hints,
      currentHintIndex: -1, // No hints revealed yet
      bugType: result.bugType,
      startTime: new Date(),
      status: 'active',
    };

    this.sessions.set(result.sessionId, session);

    return result;
  }

  /**
   * Get the next hint for an active session.
   *
   * Reveals hints progressively:
   * - First call: returns hint 1
   * - Second call: returns hint 2
   * - etc.
   *
   * Returns null if all hints have been revealed.
   *
   * @param sessionId - The session to get hint for
   * @returns Next hint with progress info, or null if no more hints
   * @throws Error if session not found
   */
  async getNextHint(sessionId: string): Promise<HintResponse | null> {
    const session = this.getSession(sessionId);

    // Check if more hints available
    const nextIndex = session.currentHintIndex + 1;
    if (nextIndex >= session.allHints.length) {
      return null; // No more hints
    }

    // Reveal next hint
    session.currentHintIndex = nextIndex;
    const hint = session.allHints[nextIndex]!;
    const isLastHint = nextIndex === session.allHints.length - 1;

    // Get appropriate encouragement
    const encouragementKey = this.getEncouragementKey(nextIndex);

    return {
      type: isLastHint ? 'solution' : 'hint',
      content: hint.hint,
      progress: `Hint ${nextIndex + 1}/${session.allHints.length}`,
      encouragement: getEncouragement(encouragementKey),
      isLastHint,
    };
  }

  /**
   * Mark a session as solved by the user.
   *
   * Call this when the user indicates they fixed the bug.
   * Records the session outcome for learning analytics.
   *
   * @param sessionId - The session to mark as solved
   * @returns Completed learning session data
   */
  async markSolved(sessionId: string): Promise<LearningSession> {
    const session = this.getSession(sessionId);
    session.status = 'solved';

    return this.finalizeSession(session, true);
  }

  /**
   * Mark a session as given up.
   *
   * Call when user requests the full solution.
   * Returns the solution and records the outcome.
   *
   * @param sessionId - The session to give up on
   * @returns Object with solution and session data
   */
  async giveUp(sessionId: string): Promise<{
    solution: string;
    session: LearningSession;
  }> {
    const session = this.getSession(sessionId);
    session.status = 'gave_up';

    // Get the final hint (which contains the solution)
    const lastHint = session.allHints[session.allHints.length - 1];
    const solution = lastHint?.hint ?? 'Solution not available';

    const learningSession = this.finalizeSession(session, false);

    return { solution, session: learningSession };
  }

  /**
   * Get current state of a session (for UI rendering).
   *
   * @param sessionId - The session to get state for
   * @returns Panel state for UI
   */
  getSessionState(sessionId: string): HintPanelState {
    const session = this.getSession(sessionId);

    // Get revealed hints (up to current index)
    const hintsRevealed = session.allHints.slice(0, session.currentHintIndex + 1);

    return {
      sessionId: session.id,
      currentHintIndex: session.currentHintIndex,
      hintsRevealed,
      showingSolution: session.status === 'gave_up',
      userSolved: session.status === 'solved',
      startTime: session.startTime,
    };
  }

  /**
   * Get hints revealed count for a session.
   * Useful for quick checks without full state.
   */
  getHintsRevealed(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.currentHintIndex + 1 : 0;
  }

  /**
   * Check if a session exists and is active.
   */
  hasActiveSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === 'active';
  }

  /**
   * Clean up completed sessions older than specified age.
   * Call periodically to prevent memory leaks.
   *
   * @param maxAgeMs - Max age in milliseconds (default: 1 hour)
   * @returns Number of sessions cleaned up
   */
  cleanupOldSessions(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      const age = now - session.startTime.getTime();
      if (age > maxAgeMs && session.status !== 'active') {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[HintSystem] Cleaned up ${cleaned} old sessions`);
    }

    return cleaned;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get session by ID, throw if not found.
   */
  private getSession(sessionId: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Convert active session to finalized LearningSession.
   */
  private finalizeSession(
    session: ActiveSession,
    solved: boolean
  ): LearningSession {
    const endTime = new Date();
    const timeSpentMs = endTime.getTime() - session.startTime.getTime();

    return {
      id: session.id,
      bug: session.bug,
      bugType: session.bugType,
      hintsGiven: session.allHints.slice(0, session.currentHintIndex + 1),
      solved,
      hintsNeeded: session.currentHintIndex + 1,
      timeSpent: Math.round(timeSpentMs / 1000), // Convert to seconds
      timestamp: session.startTime,
      gaveUp: !solved,
    };
  }

  /**
   * Get encouragement message key based on hint index.
   */
  private getEncouragementKey(
    hintIndex: number
  ): 'afterHint1' | 'afterHint2' | 'afterHint3' {
    if (hintIndex === 0) return 'afterHint1';
    if (hintIndex === 1) return 'afterHint2';
    return 'afterHint3';
  }
}
