import * as vscode from "vscode";
import * as fs from "fs";

export type AnalysisResult = {
  selectedCode: string;
  hints: { level: number; hint: string; type: string }[];
  bugType: string;
  solution?: string;
};

export class HintPanel {
  private panel?: vscode.WebviewPanel;
  private currentHintIndex = 0;
  private analysisResult?: AnalysisResult;

  show(analysisResult: AnalysisResult): void {
    this.analysisResult = analysisResult;
    this.currentHintIndex = 0;

    this.panel = vscode.window.createWebviewPanel(
      "debugduckHints",
      "DebugDuck 🦆",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.panel.webview.html = this.render();

    this.panel.webview.onDidReceiveMessage(message => {
      if (message.command === "nextHint") this.showNextHint();
      if (message.command === "giveUp") this.showSolution();
      if (message.command === "solved") this.onSolved();
    });
  }

  private showNextHint(): void {
    if (!this.analysisResult) return;

    if (this.currentHintIndex < this.analysisResult.hints.length - 1) {
      this.currentHintIndex++;
      this.panel?.webview.postMessage({
        command: "update",
        hintIndex: this.currentHintIndex
      });
    } else {
      vscode.window.showInformationMessage(
        "No more hints. The duck trusts you now. 🦆"
      );
    }
  }

  private showSolution(): void {
    this.panel?.webview.postMessage({
      command: "showSolution",
      solution: this.analysisResult?.solution ?? "No solution yet."
    });
  }

  private onSolved(): void {
    vscode.window.showInformationMessage("Nice fix. The duck nods. 🦆");
    this.panel?.dispose();
  }

    private render(): string {
    const htmlPath = vscode.Uri.joinPath(
        vscode.Uri.file(__dirname),
        "../../src/ui/templates/hintPanel.html"
    );

    let html = fs.readFileSync(htmlPath.fsPath, "utf8");

    html = html.replace(
        "window.__DATA__",
        JSON.stringify(this.analysisResult)
    );

    return html;
    }

}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
