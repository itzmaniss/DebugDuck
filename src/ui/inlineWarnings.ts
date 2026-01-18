/**
 * DebugDuck Inline Warnings
 *
 * Displays duck warnings directly in the editor:
 * - Gutter icons (duck emoji)
 * - Inline text decorations
 * - Hover tooltips with suggestions
 * - Tracks mistake history for personalized feedback
 */

import * as vscode from "vscode";

// =============================================================================
// Types
// =============================================================================

/**
 * A warning to display in the editor.
 */
export type Warning = {
  id: string; // Unique identifier
  type: string; // Bug type (e.g., "undefined-access")
  range: vscode.Range; // Location in document
  message: string; // Short message
  suggestion: string; // How to fix it
};

// =============================================================================
// Global State
// =============================================================================

/**
 * Persistent mistake counter - tracks how many times each bug type occurs.
 * Used to show "You've made this mistake X times" in hover tooltips.
 */
const mistakeCounter = new Map<string, number>();

/**
 * Shared decoration type for duck gutter icons.
 * Using a single instance prevents decoration flickering.
 */
const duckDecorationType = vscode.window.createTextEditorDecorationType({
  gutterIconPath: vscode.Uri.parse(
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
         <text x="0" y="14" font-size="14">🦆</text>
       </svg>`,
      ),
  ),
  gutterIconSize: "contain",
});

// =============================================================================
// Initialization
// =============================================================================

/**
 * Load persisted mistake counts from global state.
 * Called when the module is first imported.
 */
function loadPersistedMistakes(): void {
  // Note: extensionContext may not be available immediately on import
  // This is handled gracefully - counts start at 0 if not loaded
}

// =============================================================================
// InlineWarnings Class
// =============================================================================

/**
 * Manages inline warning decorations for a document.
 *
 * Usage:
 * ```typescript
 * const warnings = new InlineWarnings();
 *
 * // Apply warnings to document
 * warnings.applyWarnings(document, warningList);
 *
 * // Clear when done
 * warnings.clearWarnings(document);
 *
 * // Dispose when no longer needed
 * warnings.dispose();
 * ```
 */
export class InlineWarnings {
  private warnings: Warning[] = [];
  private changeListener?: vscode.Disposable;
  private decorationType = duckDecorationType;

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Apply warnings to a document.
   * Shows duck icons in gutter and inline messages.
   *
   * @param document - The document to decorate
   * @param newWarnings - Warnings to display
   * @param replace - If true, replaces existing warnings. If false, appends.
   */
  applyWarnings(
    document: vscode.TextDocument,
    newWarnings: Warning[],
    replace: boolean = false,
  ): void {
    // Find the editor for this document
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === document.uri.toString(),
    );
    if (!editor) return;

    // Update warning list
    if (replace) {
      this.warnings = newWarnings;
    } else {
      this.warnings = [...this.warnings, ...newWarnings];
    }

    // Update mistake counter for each warning type
    for (const warning of newWarnings) {
      const currentCount = mistakeCounter.get(warning.type) ?? 0;
      mistakeCounter.set(warning.type, currentCount + 1);
    }

    // Persist mistake counts
    this.persistMistakeCounts();

    // Create decorations with rich hover content
    const decorations: vscode.DecorationOptions[] = this.warnings.map(
      (warning) => {
        const count = mistakeCounter.get(warning.type) ?? 1;

        // Build rich hover tooltip
        const hoverContent = this.buildHoverContent(warning, count);

        return {
          range: warning.range,
          hoverMessage: hoverContent,
          renderOptions: {
            after: {
              contentText: ` 🦆 ${warning.message}`,
              fontStyle: "italic",
              color: new vscode.ThemeColor("editorWarning.foreground"),
            },
          },
        };
      },
    );

    // Apply decorations to editor
    editor.setDecorations(this.decorationType, decorations);

    // Set up listener to clear warnings when document changes
    this.changeListener?.dispose();
    this.changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        // User is editing - clear warnings to avoid stale decorations
        this.clearWarnings(document);
      }
    });
  }

  /**
   * Clear all warnings from a document.
   *
   * @param document - The document to clear
   */
  clearWarnings(document: vscode.TextDocument): void {
    this.warnings = [];

    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === document.uri.toString(),
    );

    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }

    this.changeListener?.dispose();
    this.changeListener = undefined;
  }

  /**
   * Get all current warnings.
   */
  getWarnings(): Warning[] {
    return [...this.warnings];
  }

  /**
   * Dispose of resources.
   * Call this when the warnings instance is no longer needed.
   */
  dispose(): void {
    this.warnings = [];
    this.changeListener?.dispose();
    // Note: Don't dispose decorationType as it's shared
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build rich hover content for a warning.
   */
  private buildHoverContent(
    warning: Warning,
    mistakeCount: number,
  ): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true; // Allow command links

    // Header
    markdown.appendMarkdown("### 🦆 DebugDuck Warning\n\n");

    // Issue description
    markdown.appendMarkdown(`**Issue:** ${warning.message}\n\n`);

    // Mistake count (personalized feedback)
    if (mistakeCount > 1) {
      markdown.appendMarkdown(
        `⚠️ You've made this type of mistake **${mistakeCount} time${mistakeCount > 1 ? "s" : ""}**\n\n`,
      );
    }

    // Suggestion
    markdown.appendMarkdown(`💡 **Suggestion:** ${warning.suggestion}\n\n`);

    // Divider
    markdown.appendMarkdown("---\n\n");

    // Action links
    markdown.appendMarkdown(
      "▶️ [Mark as solved](command:debugduck.markSolved) | " +
        "📊 [Dashboard](command:debugduck.showDashboard) | " +
        "⚙️ [Settings](command:debugduck.showSettings)\n",
    );

    return markdown;
  }

  /**
   * Persist mistake counts to VS Code global state.
   */
  private persistMistakeCounts(): void {
    try {
      // Get extension context from the global export
      const { extensionContext } = require("../extension");
      if (extensionContext) {
        extensionContext.globalState.update(
          "mistakeCounter",
          Array.from(mistakeCounter.entries()),
        );
      }
    } catch {
      // Context not available - will persist next time
    }
  }
}

// =============================================================================
// Module Initialization
// =============================================================================

/**
 * Load persisted mistakes on module load.
 * This runs when the module is first imported.
 */
try {
  const { extensionContext } = require("../extension");
  if (extensionContext) {
    const saved =
      extensionContext.globalState.get<[string, number][]>("mistakeCounter");
    if (saved) {
      for (const [type, count] of saved) {
        mistakeCounter.set(type, count);
      }
    }
  }
} catch {
  // Extension context not yet available - will load when accessed
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the current mistake count for a bug type.
 *
 * @param bugType - The bug type to check
 * @returns Number of times this bug type has been seen
 */
export function getMistakeCount(bugType: string): number {
  return mistakeCounter.get(bugType) ?? 0;
}

/**
 * Reset all mistake counts.
 * Used when user resets their progress.
 */
export function resetMistakeCounts(): void {
  mistakeCounter.clear();
  try {
    const { extensionContext } = require("../extension");
    if (extensionContext) {
      extensionContext.globalState.update("mistakeCounter", undefined);
    }
  } catch {
    // Ignore if context not available
  }
}
