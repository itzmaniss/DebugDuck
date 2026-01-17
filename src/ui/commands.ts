import * as vscode from "vscode";
import { HintPanel, type AnalysisResult } from "./hintPanel";
import { ProgressDashboard, type DashboardData } from "./progressDashboard";
import { InlineWarnings, type Warning } from "./inlineWarnings";

const mockHints = [
  { level: 1, hint: "What if this is undefined?", type: "question" },
  { level: 2, hint: "Check the array access", type: "direction" }
];

export function analyzeSelection(
  context: vscode.ExtensionContext,
  activeWarnings?: Map<string, InlineWarnings>
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("Select some code first 🦆");
    return;
  }

  const documentUri = editor.document.uri.toString();

  const analysis: AnalysisResult = {
    selectedCode: editor.document.getText(editor.selection),
    hints: mockHints,
    bugType: "undefined-access",
    solution: "Add a guard clause before accessing the value.",
    document: editor.document
  };

  const warnings: Warning[] = [
    {
      id: crypto.randomUUID(),
      type: "undefined-access",
      range: editor.selection,
      message: "Might be undefined",
      suggestion: "Use optional chaining (?.)"
    }
  ];

  const inlineWarnings = new InlineWarnings();
  inlineWarnings.applyWarnings(editor.document, warnings);

  activeWarnings?.set(documentUri, inlineWarnings);

  new HintPanel().show(analysis, () => {
    inlineWarnings.clearWarnings(editor.document);
    activeWarnings?.delete(documentUri);
  });
}

export function showDashboard(context: vscode.ExtensionContext) {
  const dashboard = new ProgressDashboard(context);
  dashboard.show();
}
