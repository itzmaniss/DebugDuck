import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export type DashboardData = {
  totalBugs: number;
  solveRate: number;
  streak: number;
  topPatterns: { type: string; count: number }[];
  recentSessions: {
    date: string;
    bugType: string;
    solved: boolean;
  }[];
  achievements: string[];
};

export class ProgressDashboard {
  private panel?: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "debugduckDashboard",
      "DebugDuck Progress",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    // Load HTML from template
    const htmlPath = path.join(
      this.context.extensionPath,
      "out",
      "ui",
      "templates",
      "dashboard.html"
    );

    this.panel.webview.html = fs.readFileSync(htmlPath, "utf8");

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  updateStats(data: DashboardData): void {
    if (!this.panel) return;
    this.panel.webview.postMessage({
      command: "updateStats",
      data
    });
  }
}