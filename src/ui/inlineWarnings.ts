import * as vscode from "vscode";
import { extensionContext } from "../extension";

export type Warning = {
  id: string;
  type: string;
  range: vscode.Range;
  message: string;
  suggestion: string;
};

// Persistent mistake counter
const mistakeCounter = new Map<string, number>();

// Restore persisted data
const saved = extensionContext?.globalState.get<[string, number][]>("mistakeCounter");
if (saved) {
  for (const [k, v] of saved) mistakeCounter.set(k, v);
}

const duckDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.parse(
      "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
             <text x="0" y="14" font-size="14">🦆</text>
           </svg>`
        )
    ),
    gutterIconSize: "contain"
});

export class InlineWarnings {
  private warnings: Warning[] = [];
  private changeListener?: vscode.Disposable;

  private decorationType = duckDecorationType;

  applyWarnings(
    document: vscode.TextDocument,
    newWarnings: Warning[],
    replace: boolean = false
  ): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (!editor) return;

    if (replace) this.warnings = newWarnings;
    else this.warnings = [...this.warnings, ...newWarnings];

    for (const w of newWarnings) {
      mistakeCounter.set(w.type, (mistakeCounter.get(w.type) ?? 0) + 1);
    }

    extensionContext?.globalState.update(
      "mistakeCounter",
      Array.from(mistakeCounter.entries())
    );

    const decorations: vscode.DecorationOptions[] = this.warnings.map(w => {
      const count = mistakeCounter.get(w.type) ?? 1;

      const hover = new vscode.MarkdownString(
`### 🦆 DebugDuck Warning

**Issue:** ${w.message}

⚠️ You've made this mistake **${count} time${count > 1 ? "s" : ""}**

💡 **Suggestion:** ${w.suggestion}

---

▶️ [Mark as solved](command:debugduck.markSolved)
📊 [Open Dashboard](command:debugduck.showDashboard)
`,
        true
      );

      return {
        range: w.range,
        hoverMessage: hover,
        renderOptions: {
          after: {
            contentText: ` 🦆 ${w.message}`,
            fontStyle: "italic",
            color: new vscode.ThemeColor("editorWarning.foreground")
          }
        }
      };
    });

    editor.setDecorations(this.decorationType, decorations);

    this.changeListener?.dispose();
    this.changeListener = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        this.clearWarnings(document);
      }
    });
  }

  clearWarnings(document: vscode.TextDocument): void {
    this.warnings = [];

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (!editor) return;

    editor.setDecorations(this.decorationType, []);
    this.changeListener?.dispose();
  }

  dispose(): void {
    this.warnings = [];
    this.changeListener?.dispose();
    this.decorationType.dispose();
  }
}
