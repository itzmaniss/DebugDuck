import * as vscode from "vscode";
import { HintPanel, type AnalysisResult } from "./hintPanel";

const mockHints = [
  { level: 1, hint: "What if this is undefined?", type: "question" },
  { level: 2, hint: "Check the array access", type: "direction" }
];

export function analyzeSelection(_: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("Select some code first 🦆");
    return;
  }

  const analysis: AnalysisResult = {
    selectedCode: editor.document.getText(editor.selection),
    hints: mockHints,
    bugType: "undefined-access",
    solution: "Add a guard clause before accessing the value."
  };

  new HintPanel().show(analysis);
}



export function showDashboard(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    "debugduckDashboard",
    "DebugDuck Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <body>
      <h2>DebugDuck Dashboard</h2>
      <p>Progress tracking coming soon.</p>
    </body>
    </html>
  `;
}
