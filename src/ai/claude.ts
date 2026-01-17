/**
 * ClaudeClient - Anthropic Claude API Integration
 *
 * This module handles all communication with Claude for generating
 * progressive debugging hints. It's the core AI backbone of DebugDuck.
 *
 * Token Optimization Strategies:
 * 1. In-memory cache with TTL - same code = no API call
 * 2. Tiered models - Haiku for simple bugs, Sonnet for complex
 * 3. Compact prompts - externalized to prompts.ts
 * 4. Response length caps - based on hint count needed
 *
 * @module ai/claude
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Bug,
  AnalysisResult,
  HintLevel,
  ClaudeResponse,
  HintType,
  CachedHint,
} from "../types";
import { getAnalysisPrompt, getSystemPrompt } from "./prompts";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Simple hash function for cache keys.
 * Uses djb2 algorithm - fast and good distribution for strings.
 */
function hashCode(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Model tiers for cost optimization.
 *
 * Pricing (as of 2024):
 * - Haiku: ~$0.25 input / $1.25 output per 1M tokens
 * - Sonnet: ~$3 input / $15 output per 1M tokens
 *
 * Strategy: Use Haiku for simple/common bugs, Sonnet for complex analysis
 */
const MODELS = {
  fast: "claude-3-5-haiku-20241022", // Quick, cheap - simple bugs
  smart: "claude-sonnet-4-20250514", // Thorough - complex bugs
} as const;

/**
 * Regex patterns indicating simple, well-known bugs.
 * These bugs have predictable solutions and don't need deep analysis.
 * Haiku handles these well, saving ~10x on token costs.
 */
const SIMPLE_BUG_PATTERNS = [
  /undefined is not/i,
  /cannot read propert/i,
  /null reference/i,
  /is not a function/i,
  /index out of bounds/i,
  /off.by.one/i,
  /=== vs ==/i,
  /missing return/i,
  /unreachable code/i,
] as const;

// =============================================================================
// Client Configuration
// =============================================================================

/** Options for ClaudeClient constructor */
export interface ClaudeClientOptions {
  /** Cache TTL in minutes (default: 60) */
  cacheTTLMinutes?: number;
  /** Force use of smart model regardless of bug complexity */
  alwaysUseSmart?: boolean;
}

// =============================================================================
// ClaudeClient Class
// =============================================================================

/**
 * Client for interacting with Claude API to generate debugging hints.
 *
 * Features:
 * - In-memory caching with configurable TTL
 * - Automatic model selection based on bug complexity
 * - Graceful fallbacks on API failure
 *
 * @example
 * ```typescript
 * const client = new ClaudeClient(apiKey);
 * const result = await client.analyzeCode({
 *   code: 'const x = arr[i].name;',
 *   language: 'typescript',
 *   errorMessage: 'Cannot read property name of undefined'
 * });
 * // Uses Haiku (cheap) because error matches simple pattern
 * ```
 *
 * @example
 * ```typescript
 * const client = new ClaudeClient(apiKey, { alwaysUseSmart: true });
 * // Forces Sonnet for all requests (useful for complex codebases)
 * ```
 */
export class ClaudeClient {
  private client: Anthropic;

  /**
   * In-memory cache: code hash -> cached result
   * Avoids repeated API calls for identical code snippets
   */
  private cache: Map<string, CachedHint> = new Map();

  /** Cache TTL in milliseconds */
  private readonly cacheTTL: number;

  /** Max cache entries to prevent memory bloat */
  private readonly maxCacheSize = 100;

  /** Force smart model regardless of complexity analysis */
  private readonly alwaysUseSmart: boolean;

  constructor(apiKey: string, options?: ClaudeClientOptions) {
    if (!apiKey) {
      throw new Error("API key is required for ClaudeClient");
    }
    this.client = new Anthropic({ apiKey });
    this.cacheTTL = (options?.cacheTTLMinutes ?? 60) * 60 * 1000;
    this.alwaysUseSmart = options?.alwaysUseSmart ?? false;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Analyze buggy code and generate progressive hints.
   *
   * Flow:
   * 1. Check cache - return immediately if hit (saves API call)
   * 2. Select model based on bug complexity
   * 3. Call Claude API with optimized token limits
   * 4. Parse, validate, cache, and return result
   *
   * @param bug - The bug context including code, language, and optional error
   * @param hintCount - Number of hints to generate (default: 4, affects token limit)
   * @returns Structured analysis with progressive hints
   * @throws Error if API call fails (caller should handle gracefully)
   */
  async analyzeCode(bug: Bug, hintCount: number = 4): Promise<AnalysisResult> {
    // Step 1: Check cache first - saves API call if we've seen this code
    const cacheKey = this.getCacheKey(bug);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log("[ClaudeClient] Cache hit - skipping API call");
      return {
        ...cached.result,
        sessionId: this.generateSessionId(), // Fresh session ID even for cached
      };
    }

    // Step 2: Build prompts
    const systemPrompt = getSystemPrompt();
    const userPrompt = getAnalysisPrompt(bug, hintCount);

    // Step 3: Select model based on bug complexity
    const model = this.selectModel(bug);

    // Step 4: Calculate token limit based on hint count
    // ~300 tokens per hint + ~200 for metadata (bugType, difficulty, etc.)
    const maxTokens = Math.min(hintCount * 300 + 200, 2000);

    // Step 5: Call API
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Step 6: Parse response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude API");
    }

    const parsed = this.parseResponse(content.text);

    // Step 7: Build result
    const result: AnalysisResult = {
      sessionId: this.generateSessionId(),
      hints: parsed.hints,
      bugType: parsed.bugType,
      difficulty: this.normalizeDifficulty(parsed.difficulty),
      learningObjective: parsed.learningObjective,
    };

    // Step 8: Cache for future identical requests
    this.addToCache(cacheKey, result);

    return result;
  }

  /**
   * Generate a quick warning message for real-time code analysis.
   *
   * Used by the prevention engine for inline warnings.
   * Always uses Haiku for speed and cost efficiency.
   *
   * @param code - The code snippet with potential bug
   * @param language - Programming language
   * @param bugType - Type of bug detected
   * @returns Brief warning message (under 50 words)
   */
  async getQuickWarning(
    code: string,
    language: string,
    bugType: string,
  ): Promise<string> {
    try {
      // Always use fast model for warnings - they need to be quick and cheap
      const response = await this.client.messages.create({
        model: MODELS.fast,
        max_tokens: 100, // Short response for inline display
        system:
          "You are a helpful coding assistant. Provide a brief, friendly warning about a potential bug. Keep it under 50 words. Be specific.",
        messages: [
          {
            role: "user",
            content: `Language: ${language}\nBug type: ${bugType}\n\nCode:\n${code}\n\nBrief warning:`,
          },
        ],
      });

      const content = response.content[0];
      return content.type === "text"
        ? content.text
        : "Potential issue detected.";
    } catch (error) {
      console.error("[ClaudeClient] Warning generation failed:", error);
      return "Potential issue detected. Review this code carefully.";
    }
  }

  /**
   * Clear the entire cache.
   * Useful for testing or when user changes API key.
   */
  clearCache(): void {
    this.cache.clear();
    console.log("[ClaudeClient] Cache cleared");
  }

  /**
   * Get cache statistics for monitoring/debugging.
   */
  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }

  // ===========================================================================
  // Model Selection
  // ===========================================================================

  /**
   * Select the appropriate model based on bug complexity.
   *
   * Uses Haiku (cheap/fast) when:
   * - Code is short (< 30 lines)
   * - Error message matches known simple patterns
   * - alwaysUseSmart is not set
   *
   * Uses Sonnet (thorough) when:
   * - Code is complex/long
   * - Bug pattern is unclear
   * - alwaysUseSmart is enabled
   */
  private selectModel(bug: Bug): string {
    if (this.alwaysUseSmart) {
      console.log("[ClaudeClient] Using smart model (forced)");
      return MODELS.smart;
    }

    const lineCount = bug.code.split("\n").length;
    const isShortCode = lineCount < 30;
    const isSimpleBug = this.matchesSimplePattern(bug);

    // Use fast model only if BOTH conditions are met
    const useFast = isShortCode && isSimpleBug;

    const model = useFast ? MODELS.fast : MODELS.smart;
    console.log(
      `[ClaudeClient] Model: ${useFast ? "Haiku" : "Sonnet"} ` +
        `(lines: ${lineCount}, simplePattern: ${isSimpleBug})`,
    );

    return model;
  }

  /**
   * Check if bug matches known simple patterns.
   * These are bugs that Haiku can handle well.
   */
  private matchesSimplePattern(bug: Bug): boolean {
    // Combine code and error message for pattern matching
    const searchText = `${bug.code} ${bug.errorMessage || ""}`;

    return SIMPLE_BUG_PATTERNS.some((pattern) => pattern.test(searchText));
  }

  // ===========================================================================
  // Caching
  // ===========================================================================

  /**
   * Generate cache key from bug data.
   * Includes code + language + error for uniqueness.
   */
  private getCacheKey(bug: Bug): string {
    const data = `${bug.language}|${bug.code}|${bug.errorMessage || ""}`;
    return hashCode(data);
  }

  /**
   * Get cached result if valid (not expired).
   */
  private getFromCache(key: string): CachedHint | null {
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check expiration
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      console.log("[ClaudeClient] Cache entry expired, removed");
      return null;
    }

    return cached;
  }

  /**
   * Add result to cache with TTL.
   * Uses simple FIFO eviction when cache is full.
   */
  private addToCache(key: string, result: AnalysisResult): void {
    // Evict oldest entry if cache is full (FIFO via Map insertion order)
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log("[ClaudeClient] Cache full, evicted oldest entry");
      }
    }

    const now = new Date();
    this.cache.set(key, {
      codeHash: key,
      result,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.cacheTTL),
    });
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  /**
   * Parse Claude's response text into structured ClaudeResponse.
   *
   * Handles:
   * - JSON wrapped in markdown code blocks
   * - Raw JSON
   * - Malformed responses (returns fallback)
   */
  private parseResponse(text: string): ClaudeResponse {
    const jsonStr = this.extractJson(text);

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      console.error("[ClaudeClient] Parse failed:", error);
      console.error("[ClaudeClient] Raw text:", text.slice(0, 200));
      return this.createFallbackResponse();
    }
  }

  /**
   * Extract JSON from Claude's response.
   * Claude often wraps JSON in ```json ... ``` blocks.
   */
  private extractJson(text: string): string {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);

    if (codeBlockMatch?.[1]) {
      return codeBlockMatch[1].trim();
    }

    return text.trim();
  }

  /**
   * Validate and normalize parsed response to ClaudeResponse shape.
   */
  private validateAndNormalize(
    parsed: Record<string, unknown>,
  ): ClaudeResponse {
    if (!Array.isArray(parsed.hints) || parsed.hints.length === 0) {
      throw new Error("Response missing hints array");
    }

    const hints: HintLevel[] = parsed.hints.map(
      (hint: unknown, index: number) => {
        const h = hint as Record<string, unknown>;
        return {
          level: typeof h.level === "number" ? h.level : index + 1,
          hint: String(h.hint || h.text || ""),
          type: this.normalizeHintType(h.type),
        };
      },
    );

    return {
      hints,
      bugType: String(parsed.bugType || "unknown"),
      difficulty: String(parsed.difficulty || "intermediate"),
      learningObjective: String(
        parsed.learningObjective || "Debug and fix the code",
      ),
      explanation: parsed.explanation ? String(parsed.explanation) : undefined,
      preventionTips: Array.isArray(parsed.preventionTips)
        ? parsed.preventionTips.map(String)
        : undefined,
    };
  }

  /**
   * Fallback response when parsing fails.
   * Generic hints that work for most common bugs.
   */
  private createFallbackResponse(): ClaudeResponse {
    return {
      hints: [
        {
          level: 1,
          hint: "Look carefully at the code. What values might be undefined or null?",
          type: "question",
        },
        {
          level: 2,
          hint: "Check how variables are initialized before they are used.",
          type: "direction",
        },
        {
          level: 3,
          hint: "Consider edge cases: empty arrays, missing properties, unexpected input.",
          type: "concept",
        },
        {
          level: 4,
          hint: "Add console.log statements to trace actual values at runtime.",
          type: "example",
        },
      ],
      bugType: "unknown",
      difficulty: "intermediate",
      learningObjective: "Debug and understand the code issue",
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Normalize hint type to valid HintType enum value.
   */
  private normalizeHintType(type: unknown): HintType {
    const validTypes: HintType[] = [
      "question",
      "direction",
      "concept",
      "example",
    ];
    const typeStr = String(type).toLowerCase();
    return validTypes.includes(typeStr as HintType)
      ? (typeStr as HintType)
      : "direction";
  }

  /**
   * Normalize difficulty string to our three-tier system.
   */
  private normalizeDifficulty(
    difficulty: string,
  ): "beginner" | "intermediate" | "advanced" {
    const normalized = difficulty.toLowerCase();

    if (normalized === "beginner" || normalized === "easy") return "beginner";
    if (
      normalized === "advanced" ||
      normalized === "hard" ||
      normalized === "expert"
    )
      return "advanced";
    return "intermediate";
  }

  /**
   * Generate unique session ID.
   * Format: session_{timestamp}_{random}
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 9);
    return `session_${timestamp}_${random}`;
  }
}
