import * as vscode from "vscode";
import { HintPanel, type AnalysisResult } from "./hintPanel";
import { ProgressDashboard, type DashboardData } from "./progressDashboard";
import { InlineWarnings, type Warning } from "./inlineWarnings";

const mockHints = [
  { level: 1, hint: "What if this is undefined?", type: "question" },
  { level: 2, hint: "Check the array access", type: "direction" }
];

const mockDashboardData: DashboardData = {
  totalBugs: 42,
  solveRate: 0.85,
  streak: 7,
  topPatterns: [
    { type: "undefined-access", count: 12 },
    { type: "null-reference", count: 8 },
    { type: "type-error", count: 6 },
    { type: "syntax-error", count: 4 }
  ],
  recentSessions: [
    { date: "2026-01-17", bugType: "undefined-access", solved: true },
    { date: "2026-01-16", bugType: "null-reference", solved: true },
    { date: "2026-01-15", bugType: "type-error", solved: false },
    { date: "2026-01-14", bugType: "syntax-error", solved: true },
    { date: "2026-01-13", bugType: "undefined-access", solved: true }
  ],
  achievements: ["First Bug 🐛", "Week Streak 🔥", "Fast Learner ⚡", "Bug Hunter 🎯"]
};

export function analyzeSelection(
  context: vscode.ExtensionContext,
  activeWarnings?: Map<string, InlineWarnings>
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage("Select some code first 🦆");
    return;
  }

  const selectedCode = editor.document.getText(editor.selection);
  const documentUri = editor.document.uri.toString();

  const analysis: AnalysisResult = {
    selectedCode,
    hints: mockHints,
    bugType: "undefined-access",
    solution: "Add a guard clause before accessing the value.",
    document: editor.document
  };

  const warnings: Warning[] = [
    {
      range: editor.selection,
      message: "Might be undefined",
      suggestion: "Use optional chaining (?.)"
    }
  ];

  // Clear any existing warnings for this document
  if (activeWarnings) {
    // Apply new warnings
    const inlineWarnings = new InlineWarnings();
    inlineWarnings.applyWarnings(editor.document, warnings);
    activeWarnings.set(documentUri, inlineWarnings);

    // Show hint panel with callback to clear warnings
    new HintPanel().show(analysis, () => {
      // This callback runs when panel closes or user clicks "solved"
      const warningInstance = activeWarnings.get(documentUri);
      if (warningInstance) {
        warningInstance.clearWarnings(editor.document);
        activeWarnings.delete(documentUri);
      }
    });
  } else {
    // Fallback if no activeWarnings map provided
    const inlineWarnings = new InlineWarnings();
    inlineWarnings.applyWarnings(editor.document, warnings);
    new HintPanel().show(analysis, () => {
      inlineWarnings.clearWarnings(editor.document);
    });
  }
}

export function showDashboard(context: vscode.ExtensionContext) {
  const dashboard = new ProgressDashboard(context);
  dashboard.show();
  setTimeout(() => dashboard.updateStats(mockDashboardData), 500);
}