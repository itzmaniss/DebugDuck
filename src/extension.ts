import { analyzeSelection, showDashboard } from "./ui/commands";
import { WarningHoverProvider } from "./ui/hoverProvider";
import { InlineWarnings, type Warning } from "./ui/inlineWarnings";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ["javascript", "typescript", "python"],
      new WarningHoverProvider()
    )
  );

  console.log("DebugDuck has run!!!! QUACK QUACK");
  vscode.window.showInformationMessage("DebugDuck is now active QUACK!");

  // Commands
  const analyzeCmd = vscode.commands.registerCommand(
    "debugduck.analyze",
    () => analyzeSelection(context)
  );

  const dashboardCmd = vscode.commands.registerCommand(
    "debugduck.showDashboard",
    () => showDashboard(context)
  );

  const dailyReviewCmd = vscode.commands.registerCommand(
    "debugduck.dailyReview",
    () => {
      vscode.window.showInformationMessage("Daily Review coming soon! 🦆");
    }
  );

  const resetProgressCmd = vscode.commands.registerCommand(
    "debugduck.resetProgress",
    () => {
      vscode.window.showWarningMessage(
        "Reset Progress? This cannot be undone QUACK!!!",
        "Reset", "Cancel"
      ).then(selection => {
        if (selection === "Reset") {
          vscode.window.showInformationMessage("Progress Reset! 🦆");
        }
      });
    }
  );

  // NEW: Listen to diagnostics and add DebugDuck annotations
  const diagnosticWatcher = vscode.languages.onDidChangeDiagnostics(e => {
    e.uris.forEach(uri => {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      const editor = vscode.window.visibleTextEditors.find(
        ed => ed.document.uri.toString() === uri.toString()
      );

      if (!editor || diagnostics.length === 0) return;

      // Convert VS Code diagnostics to DebugDuck warnings
      const warnings: Warning[] = diagnostics
        .filter(d => d.severity === vscode.DiagnosticSeverity.Error || 
                     d.severity === vscode.DiagnosticSeverity.Warning)
        .map(d => ({
          range: d.range,
          message: analyzeError(d.message),
          suggestion: getSuggestion(d.message)
        }));

      if (warnings.length > 0) {
        const inlineWarnings = new InlineWarnings();
        inlineWarnings.applyWarnings(editor.document, warnings);
      }
    });
  });

  context.subscriptions.push(
    analyzeCmd,
    dashboardCmd,
    dailyReviewCmd,
    resetProgressCmd,
    diagnosticWatcher
  );
}

// Analyze the error message and provide DebugDuck insights
function analyzeError(message: string): string {
  if (message.includes("undefined") || message.includes("Cannot read property")) {
    return "might be undefined";
  }
  if (message.includes("null")) {
    return "might be null";
  }
  if (message.includes("type")) {
    return "type mismatch";
  }
  return "needs attention";
}

// Provide suggestions based on error type
function getSuggestion(message: string): string {
  if (message.includes("undefined") || message.includes("Cannot read property")) {
    return "Use optional chaining (?.) or add a null check";
  }
  if (message.includes("null")) {
    return "Add a null check before accessing";
  }
  if (message.includes("type")) {
    return "Check your types";
  }
  return "Review the code";
}

export function deactivate() {
  // No cleanup needed for V1
}