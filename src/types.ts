/**
 * DebugDuck - Shared TypeScript Types
 * 
 * This file contains all shared interfaces and types used across the extension.
 * Both Dev 1 (Backend) and Dev 2 (Frontend) will import from this file.
 */

// ============================================================================
// Core Bug & Code Types
// ============================================================================

/**
 * Represents a bug that needs debugging
 */
export interface Bug {
  code: string;
  language: string;
  errorMessage?: string;
  lineNumber?: number;
  fileName?: string;
}

/**
 * Types of hints in the progressive learning system
 */
export type HintType = 'question' | 'direction' | 'concept' | 'example';

/**
 * A single hint in the progressive learning sequence
 */
export interface HintLevel {
  level: number;           // 1-4
  hint: string;            // The actual hint text
  type: HintType;          // What kind of hint this is
}

/**
 * Result of AI analysis on a bug
 */
export interface AnalysisResult {
  sessionId: string;       // Unique session identifier
  hints: HintLevel[];      // Progressive hints (usually 4)
  bugType: string;         // e.g., "undefined-access", "null-reference"
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  learningObjective: string; // What the user should learn
  estimatedTime?: number;  // Estimated time to solve (seconds)
}

/**
 * Response when user requests next hint
 */
export interface HintResponse {
  type: 'hint' | 'solution';
  content: string;
  progress: string;        // e.g., "Hint 2/4"
  encouragement: string;   // Motivational message
  isLastHint: boolean;
}

// ============================================================================
// Learning Session & Progress Types
// ============================================================================

/**
 * A complete debugging session
 */
export interface LearningSession {
  id: string;
  bug: Bug;
  bugType: string;
  hintsGiven: HintLevel[];
  solved: boolean;
  hintsNeeded: number;     // How many hints user actually used
  timeSpent: number;       // Seconds
  timestamp: Date;
  gaveUp: boolean;
}

/**
 * Pattern of a specific bug type
 */
export interface BugPattern {
  type: string;            // e.g., "undefined-access"
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  averageHintsNeeded: number;
  improving: boolean;      // Is user getting better at this?
  contexts: string[];      // Where this bug appears (e.g., ["loops", "array-access"])
}

/**
 * User's complete learning profile
 */
export interface LearningProfile {
  userId: string;
  totalBugs: number;
  bugsSolved: number;
  bugsGaveUp: number;
  averageHintsPerBug: number;
  patterns: Map<string, BugPattern>;
  strengths: string[];     // Bug types user handles well
  weaknesses: string[];    // Bug types user struggles with
  streak: number;          // Consecutive days of activity
  lastActive: Date;
  createdAt: Date;
}

/**
 * Insight generated from learning patterns
 */
export interface LearningInsight {
  type: 'improvement' | 'warning' | 'achievement' | 'suggestion';
  message: string;
  relatedPattern?: string;
  actionable?: string;     // What user can do about it
}

// ============================================================================
// Real-time Warning Types
// ============================================================================

/**
 * Warning severity levels
 */
export type WarningSeverity = 'info' | 'warning' | 'error';

/**
 * A warning about potential bug in code
 */
export interface Warning {
  type: string;            // Bug type (e.g., "undefined-access")
  severity: WarningSeverity;
  message: string;         // User-friendly message
  line: number;            // Line number (0-indexed)
  column?: number;         // Column number (0-indexed)
  endLine?: number;        // For multi-line warnings
  endColumn?: number;
  suggestion: string;      // How to fix it
  confidence: number;      // 0-1 (how confident AI is)
  preventable: boolean;    // Is this a repeat mistake?
}

/**
 * Detected bug before AI analysis
 */
export interface DetectedBug {
  type: string;
  line: number;
  code: string;
  context: string;         // Surrounding code
}

// ============================================================================
// Dashboard & Statistics Types
// ============================================================================

/**
 * Data for the progress dashboard
 */
export interface DashboardData {
  totalBugs: number;
  bugsSolved: number;
  solveRate: number;       // 0-1
  averageHintsNeeded: number;
  streak: number;
  topPatterns: PatternStat[];
  recentSessions: LearningSession[];
  improvements: ImprovementStat[];
  weeklyProgress: WeeklyProgress;
  achievements: Achievement[];
}

/**
 * Statistics for a bug pattern
 */
export interface PatternStat {
  type: string;
  count: number;
  averageHints: number;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Improvement statistics
 */
export interface ImprovementStat {
  type: string;
  oldAverage: number;
  newAverage: number;
  improvement: number;     // Percentage improvement
  sessions: number;        // Number of sessions in this period
}

/**
 * Weekly progress data for charts
 */
export interface WeeklyProgress {
  days: string[];          // ['Mon', 'Tue', ...]
  bugsFixed: number[];
  hintsUsed: number[];
}

/**
 * Achievement/badge earned by user
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;            // Emoji or icon name
  unlockedAt?: Date;
  progress?: number;       // For progressive achievements (0-1)
  requirement: number;     // What's needed to unlock
}

// ============================================================================
// Spaced Repetition Types
// ============================================================================

/**
 * Item scheduled for review
 */
export interface ReviewItem {
  session: LearningSession;
  nextReview: Date;
  interval: number;        // Days until next review
  easiness: number;        // SM-2 algorithm easiness factor
  reviewCount: number;
  lastReview?: Date;
}

/**
 * Result of a review session
 */
export interface ReviewResult {
  item: ReviewItem;
  success: boolean;
  hintsNeeded: number;
  timeSpent: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Extension configuration
 */
export interface DebugDuckConfig {
  apiKey: string;
  maxHints: number;
  enableRealTimeWarnings: boolean;
  enableSpacedRepetition: boolean;
  warningDebounceMs: number;
  theme: 'auto' | 'light' | 'dark';
  showEncouragement: boolean;
  soundEffects: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

/**
 * Claude API specific response
 */
export interface ClaudeResponse {
  hints: HintLevel[];
  bugType: string;
  difficulty: string;
  learningObjective: string;
  explanation?: string;
  preventionTips?: string[];
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Storage keys for VS Code workspace state
 */
export enum StorageKey {
  PROFILE = 'debugduck.profile',
  CURRENT_SESSION = 'debugduck.currentSession',
  SETTINGS = 'debugduck.settings',
  CACHE = 'debugduck.cache',
}

/**
 * Cached hint to avoid re-calling AI
 */
export interface CachedHint {
  codeHash: string;        // Hash of the code
  result: AnalysisResult;
  cachedAt: Date;
  expiresAt: Date;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * State of the hint panel
 */
export interface HintPanelState {
  sessionId: string;
  currentHintIndex: number;
  hintsRevealed: HintLevel[];
  showingSolution: boolean;
  userSolved: boolean;
  startTime: Date;
}

/**
 * State of the dashboard
 */
export interface DashboardState {
  selectedTab: 'overview' | 'patterns' | 'history' | 'achievements';
  dateRange: 'week' | 'month' | 'all';
  filterPattern?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the extension
 */
export enum DebugDuckEvent {
  SESSION_STARTED = 'session:started',
  HINT_REVEALED = 'hint:revealed',
  SESSION_SOLVED = 'session:solved',
  SESSION_GAVE_UP = 'session:gaveUp',
  PATTERN_DETECTED = 'pattern:detected',
  ACHIEVEMENT_UNLOCKED = 'achievement:unlocked',
  WARNING_DISPLAYED = 'warning:displayed',
}

/**
 * Event data payloads
 */
export interface EventPayload {
  [DebugDuckEvent.SESSION_STARTED]: { sessionId: string; bugType: string };
  [DebugDuckEvent.HINT_REVEALED]: { sessionId: string; hintLevel: number };
  [DebugDuckEvent.SESSION_SOLVED]: { sessionId: string; hintsUsed: number };
  [DebugDuckEvent.SESSION_GAVE_UP]: { sessionId: string; hintsUsed: number };
  [DebugDuckEvent.PATTERN_DETECTED]: { pattern: string; occurrences: number };
  [DebugDuckEvent.ACHIEVEMENT_UNLOCKED]: { achievement: Achievement };
  [DebugDuckEvent.WARNING_DISPLAYED]: { warning: Warning };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Common bug types that can be detected
 */
export enum BugType {
  UNDEFINED_ACCESS = 'undefined-access',
  NULL_REFERENCE = 'null-reference',
  ASYNC_AWAIT = 'async-await',
  TYPE_MISMATCH = 'type-mismatch',
  OFF_BY_ONE = 'off-by-one',
  SCOPE_ISSUE = 'scope-issue',
  INFINITE_LOOP = 'infinite-loop',
  MUTATION = 'unintended-mutation',
  COMPARISON = 'comparison-error',
  ERROR_HANDLING = 'missing-error-handling',
}

/**
 * Supported programming languages
 */
export enum SupportedLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  CPP = 'cpp',
  GO = 'go',
  RUST = 'rust',
}

/**
 * Result of a code analysis
 */
export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'error';

// ============================================================================
// Helper Type Guards
// ============================================================================

/**
 * Type guard for checking if a bug type is supported
 */
export function isSupportedBugType(type: string): type is BugType {
  return Object.values(BugType).includes(type as BugType);
}

/**
 * Type guard for checking if a language is supported
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return Object.values(SupportedLanguage).includes(lang as SupportedLanguage);
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: DebugDuckConfig = {
  apiKey: '',
  maxHints: 4,
  enableRealTimeWarnings: true,
  enableSpacedRepetition: true,
  warningDebounceMs: 3000,
  theme: 'auto',
  showEncouragement: true,
  soundEffects: false,
};

/**
 * Hint level configuration
 */
export const HINT_LEVELS = {
  MIN: 2,
  DEFAULT: 4,
  MAX: 6,
} as const;

/**
 * Achievement thresholds
 */
export const ACHIEVEMENT_THRESHOLDS = {
  FIRST_BUG: 1,
  RECRUIT: 10,
  CORPORAL: 50,
  SERGEANT: 100,
  OFFICER: 500,
  ORD_LO: 1000,
} as const;

/**
 * Time constants (in milliseconds)
 */
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Convert LearningProfile to JSON-serializable format
 */
export interface SerializedLearningProfile extends Omit<LearningProfile, 'patterns'> {
  patterns: Record<string, BugPattern>;
}

/**
 * Serialize a learning profile for storage
 */
export function serializeProfile(profile: LearningProfile): SerializedLearningProfile {
  return {
    ...profile,
    patterns: Object.fromEntries(profile.patterns),
  };
}

/**
 * Deserialize a learning profile from storage
 */
export function deserializeProfile(data: SerializedLearningProfile): LearningProfile {
  return {
    ...data,
    patterns: new Map(Object.entries(data.patterns)),
    lastActive: new Date(data.lastActive),
    createdAt: new Date(data.createdAt),
  };
}