/**
 * Prompts - System and User Prompts for Claude API
 *
 * This module contains all prompts used for hint generation.
 * Externalized from claude.ts for easier iteration and testing.
 *
 * Design Principles:
 * 1. Compact - fewer tokens = lower cost
 * 2. Structured - request JSON output for reliable parsing
 * 3. Pedagogical - teach, don't just solve
 *
 * @module ai/prompts
 */

import type { Bug } from "../types";

// =============================================================================
// System Prompt
// =============================================================================

/**
 * System prompt that defines Claude's teaching persona.
 *
 * Key characteristics:
 * - Patient teacher, not a code fixer
 * - Progressive hints from vague to specific
 * - Focus on teaching debugging skills
 * - Always returns structured JSON
 *
 * Token cost: ~400 tokens (optimized from ~800)
 */
export function getSystemPrompt(): string {
  return `You are DebugDuck, a patient coding teacher who helps developers learn to debug.

ROLE:
- Guide users to find bugs themselves through progressive hints
- Never give the answer directly until the final hint
- Teach debugging skills, not just solutions

HINT PROGRESSION (4 levels):
1. question: Ask what could go wrong (vague)
2. direction: Point to the problem area
3. concept: Explain the underlying issue
4. example: Show the fix with code

RESPONSE FORMAT (JSON only):
{
  "bugType": "string (e.g., undefined-access, off-by-one)",
  "difficulty": "beginner|intermediate|advanced",
  "learningObjective": "What the user will learn",
  "hints": [
    {"level": 1, "type": "question", "hint": "..."},
    {"level": 2, "type": "direction", "hint": "..."},
    {"level": 3, "type": "concept", "hint": "..."},
    {"level": 4, "type": "example", "hint": "..."}
  ]
}

RULES:
- Be encouraging but not patronizing
- Keep hints concise (1-2 sentences each, except level 4)
- Level 4 should include the actual fix
- Respond ONLY with valid JSON, no markdown`;
}

// =============================================================================
// Analysis Prompt
// =============================================================================

/**
 * Build user prompt for bug analysis.
 *
 * Includes:
 * - Language context for syntax awareness
 * - The buggy code
 * - Error message if available (helps identify bug type)
 * - Hint count for customization
 *
 * @param bug - Bug context
 * @param hintCount - Number of hints to generate (default: 4)
 */
export function getAnalysisPrompt(bug: Bug, hintCount: number = 4): string {
  const parts: string[] = [];

  // Language context
  parts.push(`Language: ${bug.language}`);

  // Error message if available (very helpful for diagnosis)
  if (bug.errorMessage) {
    parts.push(`Error: ${bug.errorMessage}`);
  }

  // File context if available
  if (bug.fileName) {
    parts.push(`File: ${bug.fileName}`);
  }

  // Line number if available
  if (bug.lineNumber) {
    parts.push(`Line: ${bug.lineNumber}`);
  }

  // The code itself
  parts.push(`\nCode:\n\`\`\`${bug.language}\n${bug.code}\n\`\`\``);

  // Instruction
  parts.push(
    `\nGenerate ${hintCount} progressive hints to help debug this code.`,
  );

  return parts.join("\n");
}

// =============================================================================
// Specialized Prompts
// =============================================================================

/**
 * Prompt for quick inline warnings.
 * Used by prevention engine for real-time feedback.
 * Kept very short to minimize latency and cost.
 */
export function getWarningPrompt(
  code: string,
  language: string,
  bugType: string,
): string {
  return `Language: ${language}
Bug type: ${bugType}

Code:
${code}

Write a brief, friendly warning (under 30 words) about this potential bug.`;
}

/**
 * Prompt for getting a solution explanation.
 * Used when user gives up and wants to understand the fix.
 */
export function getSolutionPrompt(bug: Bug, bugType: string): string {
  return `Language: ${bug.language}
Bug type: ${bugType}

Code:
\`\`\`${bug.language}
${bug.code}
\`\`\`

Explain the bug and provide the corrected code. Format:
{
  "explanation": "Clear explanation of what went wrong",
  "fixedCode": "The corrected code",
  "prevention": "How to avoid this in the future"
}`;
}

/**
 * Prompt for analyzing if code has common bug patterns.
 * Used by prevention engine for proactive warnings.
 * Returns structured detection results.
 */
export function getDetectionPrompt(code: string, language: string): string {
  return `Language: ${language}

Code:
\`\`\`${language}
${code}
\`\`\`

Analyze for common bugs. Return JSON array of detected issues:
[
  {
    "type": "bug-type",
    "line": 1,
    "severity": "warning|error",
    "message": "Brief description",
    "confidence": 0.8
  }
]

Only include issues with confidence > 0.6. Return [] if none found.`;
}

// =============================================================================
// Encouragement Messages
// =============================================================================

/**
 * Random encouragement messages shown between hints.
 * Keeps the user motivated during debugging.
 */
export const ENCOURAGEMENTS = {
  afterHint1: [
    "Take your time to think about it!",
    "You've got this!",
    "Debugging is detective work - look for clues.",
    "What does the error message tell you?",
  ],
  afterHint2: [
    "Getting closer!",
    "You're on the right track.",
    "Almost there - focus on that area.",
    "Good progress! Keep going.",
  ],
  afterHint3: [
    "One more hint available if you need it.",
    "You're very close now!",
    "The answer is within reach.",
    "Trust your instincts!",
  ],
  onSolve: [
    "Excellent work! You debugged it!",
    "Great job! You found the bug!",
    "Well done! That's one less bug in the world.",
    "You did it! Debugging skills leveled up!",
  ],
  onGiveUp: [
    "No worries! Learning from solutions is valuable too.",
    "It's okay - this one was tricky.",
    "Now you know for next time!",
    "Every bug teaches us something new.",
  ],
} as const;

/**
 * Get a random encouragement message for a given situation.
 */
export function getEncouragement(
  situation: keyof typeof ENCOURAGEMENTS,
): string {
  const messages = ENCOURAGEMENTS[situation];
  const index = Math.floor(Math.random() * messages.length);
  return messages[index] ?? messages[0]!;
}
