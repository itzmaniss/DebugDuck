import * as vscode from "vscode";

export class WarningHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position);
    if (!range) return;

    // In a real implementation, you'd check if this position has a warning
    // For now, showing mock data
    const word = document.getText(range);
    
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportHtml = true;
    
    md.appendMarkdown(`
### 🦆 DebugDuck Warning

You've made this mistake **3 times before**!

---

💡 **Suggestion:** Use optional chaining

\`\`\`python
prices: number = price
\`\`\`

---

📚 [Learn more about this pattern](command:debugduck.showDashboard)
    `);

    return new vscode.Hover(md, range);
  }
}
