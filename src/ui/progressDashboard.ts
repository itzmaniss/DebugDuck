/**
 * DebugDuck Progress Dashboard
 *
 * Webview panel showing learning statistics and progress.
 * Displays:
 * - Total bugs fixed and solve rate
 * - Current streak
 * - Bug pattern breakdown chart
 * - Recent sessions list
 * - Achievements/badges
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Types
// =============================================================================

/**
 * Data structure for the dashboard display.
 */
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

// =============================================================================
// ProgressDashboard Class
// =============================================================================

/**
 * Manages the progress dashboard webview panel.
 *
 * Usage:
 * ```typescript
 * const dashboard = new ProgressDashboard(context);
 * dashboard.show();
 *
 * // Later, update with real data
 * dashboard.updateStats(dashboardData);
 * ```
 */
export class ProgressDashboard {
  private panel?: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Show the dashboard panel.
   * If already open, reveals it. Otherwise creates a new panel.
   */
  show(): void {
    // If panel exists, just reveal it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    this.panel = vscode.window.createWebviewPanel(
      "debugduckDashboard",
      "🦆 DebugDuck Progress",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(
            path.join(this.context.extensionPath, "out", "ui", "templates"),
          ),
          vscode.Uri.file(
            path.join(this.context.extensionPath, "src", "ui", "templates"),
          ),
        ],
      },
    );

    // Load HTML content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions,
    );

    // Clean up on dispose
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Send initial loading state
    this.sendLoadingState();
  }

  /**
   * Update the dashboard with new statistics.
   *
   * @param data - Dashboard data to display
   */
  updateStats(data: DashboardData): void {
    if (!this.panel) return;

    this.panel.webview.postMessage({
      command: "updateStats",
      data,
    });
  }

  /**
   * Close the dashboard panel.
   */
  close(): void {
    this.panel?.dispose();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Send loading state to webview.
   */
  private sendLoadingState(): void {
    // Show zeros initially, will be updated with real data
    this.updateStats({
      totalBugs: 0,
      solveRate: 0,
      streak: 0,
      topPatterns: [],
      recentSessions: [],
      achievements: [],
    });
  }

  /**
   * Handle messages from the webview.
   */
  private handleMessage(message: { command: string }): void {
    switch (message.command) {
      case "refresh":
        // Trigger a refresh by executing the dashboard command
        vscode.commands.executeCommand("debugduck.showDashboard");
        break;
      case "openSettings":
        vscode.commands.executeCommand("debugduck.showSettings");
        break;
      case "resetProgress":
        vscode.commands.executeCommand("debugduck.resetProgress");
        break;
    }
  }

  /**
   * Get the HTML content for the dashboard.
   */
  private getHtmlContent(): string {
    // Try multiple paths for the template
    const possiblePaths = [
      path.join(
        this.context.extensionPath,
        "out",
        "ui",
        "templates",
        "dashboard.html",
      ),
      path.join(
        this.context.extensionPath,
        "src",
        "ui",
        "templates",
        "dashboard.html",
      ),
    ];

    for (const htmlPath of possiblePaths) {
      try {
        if (fs.existsSync(htmlPath)) {
          return fs.readFileSync(htmlPath, "utf8");
        }
      } catch (error) {
        console.error(
          `Failed to read dashboard template from ${htmlPath}:`,
          error,
        );
      }
    }

    // Fallback HTML if template not found
    return this.getFallbackHtml();
  }

  /**
   * Fallback HTML if template loading fails.
   */
  private getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 24px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .header h2 {
      margin: 0;
      font-size: 1.5em;
    }
    .duck {
      font-size: 2em;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 12px;
      padding: 16px;
    }
    .stat-label {
      font-size: 0.75em;
      text-transform: uppercase;
      opacity: 0.7;
      letter-spacing: 0.05em;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: var(--vscode-button-background);
    }
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 0.85em;
      text-transform: uppercase;
      opacity: 0.5;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    .session-item {
      display: flex;
      justify-content: space-between;
      padding: 12px;
      background: var(--vscode-editorWidget-background);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .solved { color: #22c55e; }
    .unsolved { color: #ef4444; }
    .achievement {
      display: inline-block;
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 20px;
      margin: 4px;
      font-size: 0.85em;
    }
    .empty-state {
      text-align: center;
      padding: 32px;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="duck">🦆</span>
    <h2>DebugDuck Progress</h2>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Bugs Fixed</div>
      <div class="stat-value" id="totalBugs">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Solve Rate</div>
      <div class="stat-value" id="solveRate">0%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Streak</div>
      <div class="stat-value" id="streak">0 days</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Top Bug Patterns</div>
    <div id="patterns">
      <div class="empty-state">No patterns yet. Start debugging! 🦆</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Recent Sessions</div>
    <div id="sessions">
      <div class="empty-state">No sessions yet. Select some code and analyze it!</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Achievements</div>
    <div id="achievements">
      <div class="empty-state">No achievements unlocked yet. Keep learning!</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function animateValue(el, value, suffix = "") {
      let start = 0;
      const duration = 600;
      const startTime = performance.now();

      function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const current = Math.floor(progress * value);
        el.textContent = current + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function renderPatterns(patterns) {
      const el = document.getElementById("patterns");
      if (!patterns || patterns.length === 0) {
        el.innerHTML = '<div class="empty-state">No patterns yet. Start debugging! 🦆</div>';
        return;
      }
      el.innerHTML = patterns.map(p =>
        '<div class="session-item"><span>' + p.type + '</span><span>' + p.count + ' times</span></div>'
      ).join("");
    }

    function renderSessions(sessions) {
      const el = document.getElementById("sessions");
      if (!sessions || sessions.length === 0) {
        el.innerHTML = '<div class="empty-state">No sessions yet. Select some code and analyze it!</div>';
        return;
      }
      el.innerHTML = sessions.slice(0, 5).map(s =>
        '<div class="session-item">' +
          '<div><strong>' + s.bugType + '</strong><br><small>' + s.date + '</small></div>' +
          '<span class="' + (s.solved ? 'solved' : 'unsolved') + '">' + (s.solved ? '✓' : '✗') + '</span>' +
        '</div>'
      ).join("");
    }

    function renderAchievements(achievements) {
      const el = document.getElementById("achievements");
      if (!achievements || achievements.length === 0) {
        el.innerHTML = '<div class="empty-state">No achievements unlocked yet. Keep learning!</div>';
        return;
      }
      el.innerHTML = achievements.map(a =>
        '<span class="achievement">🏆 ' + a + '</span>'
      ).join("");
    }

    window.addEventListener("message", event => {
      const msg = event.data;
      if (msg.command !== "updateStats") return;

      const d = msg.data;
      animateValue(document.getElementById("totalBugs"), d.totalBugs);
      animateValue(document.getElementById("solveRate"), Math.round(d.solveRate * 100), "%");
      animateValue(document.getElementById("streak"), d.streak, " days");

      renderPatterns(d.topPatterns);
      renderSessions(d.recentSessions);
      renderAchievements(d.achievements);
    });
  </script>
</body>
</html>`;
  }
}
