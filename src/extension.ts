import { analyzeSelection, showDashboard } from "./ui/commands";
import { InlineWarnings, type Warning } from "./ui/inlineWarnings";
import * as vscode from "vscode";

export let extensionContext: vscode.ExtensionContext;

// Store active warning instances per document
const activeWarnings = new Map<string, InlineWarnings>();

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  console.log("DebugDuck has run!!!! QUACK QUACK");
  vscode.window.showInformationMessage("DebugDuck is now active QUACK!");

  const analyzeCmd = vscode.commands.registerCommand(
    "debugduck.analyze",
    () => analyzeSelection(context, activeWarnings)
  );

  const dashboardCmd = vscode.commands.registerCommand(
    "debugduck.showDashboard",
    () => showDashboard(context)
  );

  const markSolvedCmd = vscode.commands.registerCommand(
    "debugduck.markSolved",
    () => {
      vscode.window.showInformationMessage("Marked as solved 🦆");
    }
  );

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

      const inlineWarnings = new InlineWarnings();
      inlineWarnings.applyWarnings(editor.document, warnings, true);
      activeWarnings.set(documentUri, inlineWarnings);
    });
  });

  context.subscriptions.push(
    analyzeCmd,
    dashboardCmd,
    markSolvedCmd,
    diagnosticWatcher
  );
}

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
