import * as vscode from "vscode";

export type Warning = {
  range: vscode.Range;
  message: string;
  suggestion: string;
};

export class InlineWarnings {
  private decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: "underline wavy #ff9800", // Orange wavy underline
    gutterIconPath: vscode.Uri.parse(
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
           <text x="0" y="14" font-size="14">🦆</text>
         </svg>`
      )
    ),
    gutterIconSize: "contain",
    after: {
      // This adds text after the underlined code
      color: new vscode.ThemeColor("editorWarning.foreground"),
      fontStyle: "italic",
      margin: "0 0 0 1em"
    }
  });

  private changeListener?: vscode.Disposable;

  applyWarnings(
    document: vscode.TextDocument,
    warnings: Warning[]
  ): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (!editor) return;

    const decorations: vscode.DecorationOptions[] = warnings.map(w => ({
      range: w.range,
      hoverMessage: new vscode.MarkdownString(
        `🦆 **DebugDuck Warning**\n\n${w.message}\n\n💡 **Suggestion:** ${w.suggestion}\n\n[Learn more](command:debugduck.showDashboard)`
      ),
      renderOptions: {
        after: {
          contentText: ` [🦆 warning: ${w.message}]`,
          color: new vscode.ThemeColor("editorWarning.foreground"),
          fontStyle: "italic"
        }
      }
    }));

    editor.setDecorations(this.decorationType, decorations);

    // Optional: Auto-clear on document change
    this.changeListener?.dispose();
    this.changeListener = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // Optionally clear warnings after user edits
        // Uncomment if you want auto-clear on edit:
        // this.clearWarnings(document);
        // this.changeListener?.dispose();
      }
    });
  }

  clearWarnings(document: vscode.TextDocument): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (!editor) return;

    editor.setDecorations(this.decorationType, []);
    this.changeListener?.dispose();
  }

  dispose(): void {
    this.changeListener?.dispose();
    this.decorationType.dispose();
  }
}