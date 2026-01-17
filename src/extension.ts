import * as vscode from "vscode";
import { analyzeSelection, showDashboard, showSettings } from "./ui/commands";
import { InlineWarnings, type Warning } from "./ui/inlineWarnings";

// Front-end UI panels
import { Onboarding } from "./ui/onboarding";
import { SettingsUI } from "./ui/settingsUI";

export let extensionContext: vscode.ExtensionContext;

// Store active warning instances per document
const activeWarnings = new Map<string, InlineWarnings>();

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  console.log("DebugDuck has run!!!! QUACK QUACK");
  vscode.window.showInformationMessage("DebugDuck is now active 🦆");

  // --- STATUS BAR ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = "🦆 DebugDuck | 7 day streak";
  statusBar.tooltip = "Click to open DebugDuck Dashboard";
  statusBar.command = "debugduck.showDashboard";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // --- ONBOARDING ---
  new Onboarding(context).show();

  // --- COMMANDS ---
  const analyzeCmd = vscode.commands.registerCommand(
    "debugduck.analyze",
    () => analyzeSelection(context, activeWarnings)
  );

  const dashboardCmd = vscode.commands.registerCommand(
    "debugduck.showDashboard",
    () => showDashboard(context)
  );

  const settingsCmd = vscode.commands.registerCommand(
    "debugduck.showSettings",
    () => showSettings(context)
  );

  const markSolvedCmd = vscode.commands.registerCommand(
    "debugduck.markSolved",
    () => {
      vscode.window.showInformationMessage("Marked as solved 🦆");
    }
  );

  // --- DIAGNOSTIC WATCHER ---
  const diagnosticWatcher = vscode.languages.onDidChangeDiagnostics(e => {
    e.uris.forEach(uri => {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      const editor = vscode.window.visibleTextEditors.find(
        ed => ed.document.uri.toString() === uri.toString()
      );

      if (!editor) return;

      const documentUri = uri.toString();

      const existingWarnings = activeWarnings.get(documentUri);
      if (existingWarnings) {
        existingWarnings.clearWarnings(editor.document);
      }

      if (diagnostics.length === 0) {
        activeWarnings.delete(documentUri);
        return;
      }

      const warnings: Warning[] = diagnostics.map(d => ({
        id: crypto.randomUUID(),
        type: "diagnostic",
        range: d.range,
        message: analyzeError(d.message),
        suggestion: getSuggestion(d.message)
      }));

      // Inside the diagnosticWatcher loop
      let inlineWarnings = activeWarnings.get(documentUri);

      if (!inlineWarnings) {
          inlineWarnings = new InlineWarnings();
          activeWarnings.set(documentUri, inlineWarnings);
      }

      inlineWarnings.applyWarnings(editor.document, warnings, true);
    });
  });

  context.subscriptions.push(
    analyzeCmd,
    dashboardCmd,
    settingsCmd,
    markSolvedCmd,
    diagnosticWatcher
  );
}

// --- HELPER FUNCTIONS ---
function analyzeError(message: string): string {
  if (message.includes("undefined")) return "Might be undefined";
  if (message.includes("null")) return "Might be null";
  if (message.includes("type")) return "Type mismatch";
  return "Needs attention";
}

function getSuggestion(message: string): string {
  if (message.includes("undefined")) return "Use optional chaining (?.)";
  if (message.includes("null")) return "Add a null check";
  if (message.includes("type")) return "Check your types";
  return "Review the code";
}

export function deactivate() {}
