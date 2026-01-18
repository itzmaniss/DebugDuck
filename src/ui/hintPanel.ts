/**
 * DebugDuck Hint Panel
 *
 * Webview panel that displays progressive hints for debugging.
 * Integrates with the backend engine for:
 * - Fetching next hints
 * - Marking sessions as solved
 * - Getting solutions when user gives up
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { DebugDuckEngine } from "../api";
import type { HintResponse } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * Data passed to the hint panel for display.
 * Used for both mock data (legacy) and real backend data.
 */
export type AnalysisResult = {
  selectedCode: string;
  hints: { level: number; hint: string; type: string }[];
  bugType: string;
  solution?: string;
  document?: vscode.TextDocument;
};

/**
 * Session data from the real backend.
 */
export type SessionData = {
  sessionId: string;
  selectedCode: string;
  firstHint: HintResponse;
  bugType: string;
  difficulty: string;
  learningObjective: string;
  document?: vscode.TextDocument;
};

// =============================================================================
// HintPanel Class
// =============================================================================

/**
 * Manages the hint panel webview for progressive debugging assistance.
 *
 * Usage:
 * ```typescript
 * const panel = new HintPanel();
 *
 * // With real backend (preferred)
 * panel.showWithSession(sessionData, engine, onClose);
 *
 * // With mock data (legacy/fallback)
 * panel.show(mockAnalysisResult, onClose);
 * ```
 */
export class HintPanel {
  private panel?: vscode.WebviewPanel;
  private currentHintIndex = 0;
  private hints: { level: number; hint: string; type: string }[] = [];
  private onCloseCallback?: () => void;

  // Backend integration
  private engine?: DebugDuckEngine;
  private sessionId?: string;
  private totalHints = 4;

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Show the hint panel with a real backend session.
   * This is the preferred method for production use.
   *
   * @param data - Session data from analyzeSelection
   * @param engine - The DebugDuckEngine instance
   * @param onClose - Callback when panel is closed
   */
  showWithSession(
    data: SessionData,
    engine: DebugDuckEngine,
    onClose?: () => void,
  ): void {
    this.engine = engine;
    this.sessionId = data.sessionId;
    this.onCloseCallback = onClose;
    this.currentHintIndex = 0;

    // Initialize with first hint from backend
    this.hints = [
      {
        level: 1,
        hint: data.firstHint.content,
        type: this.getHintType(1),
      },
    ];

    // Parse progress to get total hints (e.g., "1/4" -> 4)
    const progressMatch = data.firstHint.progress.match(/(\d+)\/(\d+)/);
    if (progressMatch) {
      this.totalHints = parseInt(progressMatch[2], 10);
    }

    // Create the webview panel
    this.createPanel();

    // Render with session data
    this.panel!.webview.html = this.renderSessionHtml(data);
    this.setupMessageHandlers();
  }

  /**
   * Show the hint panel with static/mock data.
   * Used as fallback when engine is not available.
   *
   * @param analysisResult - Mock analysis data
   * @param onClose - Callback when panel is closed
   */
  show(analysisResult: AnalysisResult, onClose?: () => void): void {
    this.hints = analysisResult.hints;
    this.currentHintIndex = 0;
    this.onCloseCallback = onClose;
    this.engine = undefined;
    this.sessionId = undefined;

    this.createPanel();
    this.panel!.webview.html = this.renderLegacyHtml(analysisResult);
    this.setupLegacyMessageHandlers(analysisResult);
  }

  // ==========================================================================
  // Private Methods - Panel Management
  // ==========================================================================

  /**
   * Create the webview panel.
   */
  private createPanel(): void {
    this.panel = vscode.window.createWebviewPanel(
      "debugduckHints",
      "DebugDuck 🦆",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
      this.panel = undefined;
      this.engine = undefined;
      this.sessionId = undefined;
      this.onCloseCallback = undefined;
    });
  }

  /**
   * Set up message handlers for real backend integration.
   */
  private setupMessageHandlers(): void {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "nextHint":
          await this.handleNextHint();
          break;
        case "giveUp":
          await this.handleGiveUp();
          break;
        case "solved":
          await this.handleSolved();
          break;
      }
    });
  }

  /**
   * Set up message handlers for legacy/mock data mode.
   */
  private setupLegacyMessageHandlers(analysisResult: AnalysisResult): void {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "nextHint":
          this.handleLegacyNextHint();
          break;
        case "giveUp":
          this.panel?.webview.postMessage({
            command: "showSolution",
            solution: analysisResult.solution ?? "No solution available.",
          });
          break;
        case "solved":
          this.handleLegacySolved();
          break;
      }
    });
  }

  // ==========================================================================
  // Private Methods - Backend Actions
  // ==========================================================================

  /**
   * Handle "Next Hint" button click with real backend.
   */
  private async handleNextHint(): Promise<void> {
    if (!this.engine || !this.sessionId) {
      this.handleLegacyNextHint();
      return;
    }

    try {
      const response = await this.engine.getNextHint(this.sessionId);

      if (response.type === "solution") {
        // No more hints - show solution
        this.panel?.webview.postMessage({
          command: "showSolution",
          solution: response.content,
          encouragement: response.encouragement,
        });
      } else {
        // Add new hint to list
        this.currentHintIndex++;
        this.hints.push({
          level: this.currentHintIndex + 1,
          hint: response.content,
          type: this.getHintType(this.currentHintIndex + 1),
        });

        // Update UI
        this.panel?.webview.postMessage({
          command: "update",
          hintIndex: this.currentHintIndex,
          newHint: {
            level: this.currentHintIndex + 1,
            hint: response.content,
            type: this.getHintType(this.currentHintIndex + 1),
          },
          progress: response.progress,
          encouragement: response.encouragement,
          isLastHint: response.isLastHint,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        "Failed to get next hint. Please try again.",
      );
      console.error("DebugDuck: getNextHint error:", error);
    }
  }

  /**
   * Handle "Give Up" button click with real backend.
   */
  private async handleGiveUp(): Promise<void> {
    if (!this.engine || !this.sessionId) {
      this.panel?.webview.postMessage({
        command: "showSolution",
        solution: "No solution available without backend connection.",
      });
      return;
    }

    try {
      const result = await this.engine.giveUp(this.sessionId);

      this.panel?.webview.postMessage({
        command: "showSolution",
        solution: result.solution,
        encouragement: result.encouragement,
      });

      // Clear warnings since session is complete
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        "Failed to get solution. Please try again.",
      );
      console.error("DebugDuck: giveUp error:", error);
    }
  }

  /**
   * Handle "I Fixed It" button click with real backend.
   */
  private async handleSolved(): Promise<void> {
    if (!this.engine || !this.sessionId) {
      this.handleLegacySolved();
      return;
    }

    try {
      await this.engine.markSolved(this.sessionId);

      vscode.window.showInformationMessage(
        `Great job! You solved it with ${this.currentHintIndex + 1} hint(s). 🦆`,
      );

      // Clear warnings and close panel
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
      this.panel?.dispose();
    } catch (error) {
      // Log the full error for debugging
      console.error("DebugDuck: markSolved error:", error);

      // Still show success to user - the learning happened even if storage failed
      vscode.window.showInformationMessage(
        `Nice fix! 🦆 (Note: Progress tracking may be unavailable)`,
      );

      // Clear warnings and close panel anyway
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
      this.panel?.dispose();
    }
  }

  // ==========================================================================
  // Private Methods - Legacy Handlers
  // ==========================================================================

  /**
   * Handle next hint in legacy mode (no backend).
   */
  private handleLegacyNextHint(): void {
    if (this.currentHintIndex < this.hints.length - 1) {
      this.currentHintIndex++;
      this.panel?.webview.postMessage({
        command: "update",
        hintIndex: this.currentHintIndex,
      });
    } else {
      vscode.window.showInformationMessage(
        "No more hints. The duck trusts you now. 🦆",
      );
    }
  }

  /**
   * Handle solved in legacy mode (no backend).
   */
  private handleLegacySolved(): void {
    vscode.window.showInformationMessage("Nice fix. The duck nods. 🦆");
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
    this.panel?.dispose();
  }

  // ==========================================================================
  // Private Methods - HTML Rendering
  // ==========================================================================

  /**
   * Get hint type based on level number.
   */
  private getHintType(level: number): string {
    const types = ["question", "direction", "concept", "example"];
    return types[(level - 1) % types.length];
  }

  /**
   * Render HTML for real session data.
   */
  private renderSessionHtml(data: SessionData): string {
    // Try to load template from file
    const templatePath = path.join(
      __dirname,
      "../../src/ui/templates/hintPanel.html",
    );

    try {
      let html = fs.readFileSync(templatePath, "utf8");

      // Inject data into template
      const templateData = {
        selectedCode: data.selectedCode,
        hints: this.hints,
        bugType: data.bugType,
        difficulty: data.difficulty,
        learningObjective: data.learningObjective,
        sessionId: data.sessionId,
        totalHints: this.totalHints,
      };

      html = html.replace("window.__DATA__", JSON.stringify(templateData));

      return html;
    } catch (error) {
      console.error("Failed to load hint panel template:", error);
      return this.getFallbackHtml(data);
    }
  }

  /**
   * Render HTML for legacy/mock data.
   */
  private renderLegacyHtml(analysisResult: AnalysisResult): string {
    const templatePath = path.join(
      __dirname,
      "../../src/ui/templates/hintPanel.html",
    );

    try {
      let html = fs.readFileSync(templatePath, "utf8");
      html = html.replace("window.__DATA__", JSON.stringify(analysisResult));
      return html;
    } catch (error) {
      console.error("Failed to load hint panel template:", error);
      return this.getFallbackHtml({
        selectedCode: analysisResult.selectedCode,
      });
    }
  }

  /**
   * Fallback HTML if template loading fails.
   */
  private getFallbackHtml(data: { selectedCode: string }): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .duck { font-size: 48px; text-align: center; }
    pre {
      background: #dc2626;
      color: white;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    .hint {
      background: var(--vscode-editorWidget-background);
      padding: 12px;
      border-radius: 8px;
      margin: 8px 0;
    }
    button {
      padding: 8px 16px;
      margin: 4px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="duck">🦆</div>
  <h2>Let's debug together!</h2>
  <pre>${escapeHtml(data.selectedCode)}</pre>
  <div id="hints" class="hint">Loading hints...</div>
  <div>
    <button onclick="vscode.postMessage({command:'nextHint'})">💡 Next Hint</button>
    <button onclick="vscode.postMessage({command:'giveUp'})">🏳️ Show Solution</button>
    <button onclick="vscode.postMessage({command:'solved'})">✅ I Fixed It</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
