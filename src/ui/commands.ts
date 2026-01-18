/**
 * DebugDuck Command Handlers
 *
 * This file contains the command implementations that bridge the UI with the backend.
 * Commands are registered in extension.ts and call these functions.
 */

import * as vscode from "vscode";
import { HintPanel } from "./hintPanel";
import { ProgressDashboard } from "./progressDashboard";
import { InlineWarnings, type Warning } from "./inlineWarnings";
import { SettingsUI } from "./settingsUI";
import { getEngine } from "../extension";

// =============================================================================
// ANALYZE SELECTION COMMAND
// =============================================================================

/**
 * Analyzes the currently selected code and shows progressive hints.
 *
 * Flow:
 * 1. Get selected code from active editor
 * 2. Call backend engine to analyze the bug
 * 3. Show inline warnings on the selection
 * 4. Open the hint panel with progressive hints
 *
 * @param context - VS Code extension context
 * @param activeWarnings - Map tracking active warnings per document
 */
export async function analyzeSelection(
  context: vscode.ExtensionContext,
  activeWarnings?: Map<string, InlineWarnings>,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  // Validate: Must have an active editor with selected code
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("Select some code first 🦆");
    return;
  }

  const selectedCode = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  const documentUri = editor.document.uri.toString();
  const lineNumber = editor.selection.start.line;
  const fileName = editor.document.fileName;

  // Get the backend engine instance
  const engine = getEngine();

  // Check if engine is available (requires API key)
  if (!engine) {
    const action = await vscode.window.showErrorMessage(
      "DebugDuck needs an API key to analyze code. Configure it in settings.",
      "Open Settings",
    );
    if (action === "Open Settings") {
      vscode.commands.executeCommand("debugduck.showSettings");
    }
    return;
  }

  // Show loading indicator
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "🦆 DebugDuck is analyzing your code...",
      cancellable: false,
    },
    async () => {
      try {
        // Get any error message from diagnostics on the selected line
        const diagnostics = vscode.languages.getDiagnostics(
          editor.document.uri,
        );
        const relevantDiagnostic = diagnostics.find(
          (d) => d.range.intersection(editor.selection) !== undefined,
        );
        const errorMessage = relevantDiagnostic?.message;

        // Call the backend AI to analyze the bug
        const analysis = await engine.analyzeSelection(
          selectedCode,
          language,
          errorMessage,
          lineNumber,
          fileName,
        );

        // Create inline warning for the selected code
        const warnings: Warning[] = [
          {
            id: analysis.sessionId,
            type: analysis.bugType,
            range: editor.selection,
            message: `Potential ${analysis.bugType.replace(/-/g, " ")}`,
            suggestion: analysis.firstHint.content,
          },
        ];

        // Apply visual warnings to the editor
        const inlineWarnings = new InlineWarnings();
        inlineWarnings.applyWarnings(editor.document, warnings);
        activeWarnings?.set(documentUri, inlineWarnings);

        // Show the hint panel with progressive hints
        const hintPanel = new HintPanel();
        hintPanel.showWithSession(
          {
            sessionId: analysis.sessionId,
            selectedCode,
            firstHint: analysis.firstHint,
            bugType: analysis.bugType,
            difficulty: analysis.difficulty,
            learningObjective: analysis.learningObjective,
            document: editor.document,
          },
          engine,
          // Callback when panel closes - clear warnings
          () => {
            inlineWarnings.clearWarnings(editor.document);
            activeWarnings?.delete(documentUri);
          },
        );
      } catch (error) {
        // Handle API errors gracefully
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`🦆 Analysis failed: ${errorMsg}`);
        console.error("DebugDuck analysis error:", error);
      }
    },
  );
}

// =============================================================================
// DASHBOARD COMMAND
// =============================================================================

/**
 * Opens the progress dashboard showing learning statistics.
 *
 * @param context - VS Code extension context
 */
export async function showDashboard(
  context: vscode.ExtensionContext,
): Promise<void> {
  const engine = getEngine();
  const dashboard = new ProgressDashboard(context);

  // Show dashboard immediately (will show loading state)
  dashboard.show();

  // If engine is available, fetch and display real data
  if (engine) {
    try {
      const data = await engine.getDashboardData();
      dashboard.updateStats({
        totalBugs: data.totalBugs,
        solveRate: data.solveRate,
        streak: data.streak,
        topPatterns: data.topPatterns.map((p) => ({
          type: p.type,
          count: p.count,
        })),
        recentSessions: data.recentSessions.map((s) => ({
          date: new Date(s.timestamp).toLocaleDateString(),
          bugType: s.bugType,
          solved: s.solved,
        })),
        achievements: data.achievements
          .filter((a) => a.unlockedAt)
          .map((a) => `${a.icon} ${a.name}`),
      });
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      // Dashboard will show zeros/empty state
    }
  }
}

// =============================================================================
// SETTINGS COMMAND
// =============================================================================

/**
 * Opens the settings panel for configuring DebugDuck.
 *
 * @param context - VS Code extension context
 */
export function showSettings(context: vscode.ExtensionContext): void {
  const settings = new SettingsUI(context);
  settings.show();
}

// =============================================================================
// MARK SOLVED COMMAND
// =============================================================================

/**
 * Marks the current session as solved.
 * Called from inline warning hover action.
 *
 * Note: The actual marking logic happens in HintPanel.
 * This command is a convenience action from the hover tooltip.
 */
export function markSolved(): void {
  vscode.window.showInformationMessage(
    "Nice fix! The duck nods approvingly. 🦆",
  );
}
