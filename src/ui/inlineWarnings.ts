import * as vscode from "vscode";

export type Warning = {
  range: vscode.Range;
  message: string;
  suggestion: string;
};

export class InlineWarnings {
  // Store all active warnings for this document
  private warnings: Warning[] = [];

  private decorationType = vscode.window.createTextEditorDecorationType({
    // No underline here.
    // VS Code owns the red squiggle.
    gutterIconPath: vscode.Uri.parse(
      "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
             <text x="0" y="14" font-size="14">🦆</text>
           </svg>`
        )
    ),
    gutterIconSize: "contain",
    after: {
      color: new vscode.ThemeColor("editorWarning.foreground"),
      fontStyle: "italic",
      margin: "0 0 0 1em"
    }
  });

  private changeListener?: vscode.Disposable;

  /**
   * Apply warnings to the document.
   * @param replace If true, replaces all existing warnings (diagnostics path).
   *                If false, appends (analyzeSelection path).
   */
  applyWarnings(
    document: vscode.TextDocument,
    newWarnings: Warning[],
    replace: boolean = false
  ): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (!editor) return;

    if (replace) {
      this.warnings = newWarnings;
    } else {
      this.warnings = [...this.warnings, ...newWarnings];
    }

    const decorations: vscode.DecorationOptions[] = this.warnings.map(w => ({
      range: w.range,
      hoverMessage: new vscode.MarkdownString(
        `🦆 **DebugDuck Warning**

${w.message}

💡 **Suggestion:** ${w.suggestion}

[Learn more](command:debugduck.showDashboard)`
      ),
      renderOptions: {
        after: {
          contentText: ` 🦆 ${w.message}`,
          color: new vscode.ThemeColor("editorWarning.foreground"),
          fontStyle: "italic"
        }
      }
    }));

    editor.setDecorations(this.decorationType, decorations);

    // Optional document change listener
    this.changeListener?.dispose();
    this.changeListener = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // You can auto-clear or recompute here later if needed
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
