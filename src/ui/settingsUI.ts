/**
 * DebugDuck Settings UI
 *
 * Webview panel for configuring the extension:
 * - API key input
 * - Max hints slider
 * - Real-time warnings toggle
 * - Reset progress button
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { resetMistakeCounts } from "./inlineWarnings";

// =============================================================================
// SettingsUI Class
// =============================================================================

/**
 * Manages the settings webview panel.
 *
 * Usage:
 * ```typescript
 * const settings = new SettingsUI(context);
 * settings.show();
 * ```
 */
export class SettingsUI {
  private panel?: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Show the settings panel.
   * If already open, reveals it. Otherwise creates a new panel.
   */
  show(): void {
    // If panel exists, just reveal it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create the webview panel
    this.panel = vscode.window.createWebviewPanel(
      "debugDuckSettings",
      "🦆 DebugDuck Settings",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(
            path.join(this.context.extensionPath, "src", "ui", "templates"),
          ),
          vscode.Uri.file(
            path.join(this.context.extensionPath, "out", "ui", "templates"),
          ),
        ],
      },
    );

    // Set HTML content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions,
    );

    // Clean up on dispose
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.context.subscriptions,
    );
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handle messages from the webview.
   */
  private async handleMessage(message: {
    command: string;
    apiKey?: string;
    maxHints?: number;
    enableRealTimeWarnings?: boolean;
  }): Promise<void> {
    const config = vscode.workspace.getConfiguration("debugduck");

    switch (message.command) {
      case "saveSettings":
        await this.saveSettings(config, message);
        break;

      case "resetProgress":
        await this.resetProgress();
        break;

      case "testApiKey":
        await this.testApiKey(message.apiKey);
        break;
    }
  }

  /**
   * Save settings to VS Code configuration.
   */
  private async saveSettings(
    config: vscode.WorkspaceConfiguration,
    message: {
      apiKey?: string;
      maxHints?: number;
      enableRealTimeWarnings?: boolean;
    },
  ): Promise<void> {
    try {
      // Save all settings atomically using Promise.all
      await Promise.all([
        // Save API key (sensitive - store globally)
        message.apiKey !== undefined
          ? config.update(
              "apiKey",
              message.apiKey,
              vscode.ConfigurationTarget.Global,
            )
          : Promise.resolve(),

        // Save max hints
        message.maxHints !== undefined
          ? config.update(
              "maxHints",
              message.maxHints,
              vscode.ConfigurationTarget.Global,
            )
          : Promise.resolve(),

        // Save real-time warnings toggle
        message.enableRealTimeWarnings !== undefined
          ? config.update(
              "enableRealTimeWarnings",
              message.enableRealTimeWarnings,
              vscode.ConfigurationTarget.Global,
            )
          : Promise.resolve(),
      ]);

      vscode.window.showInformationMessage("DebugDuck settings saved! 🦆");

      // Notify the webview that save was successful
      this.panel?.webview.postMessage({ command: "saveSuccess" });
    } catch (error) {
      vscode.window.showErrorMessage(
        "Failed to save settings. Please try again.",
      );
      console.error("DebugDuck: Failed to save settings:", error);
    }
  }

  /**
   * Reset all learning progress.
   */
  private async resetProgress(): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      "Reset all DebugDuck learning progress? This cannot be undone.",
      "Reset",
      "Cancel",
    );

    if (choice !== "Reset") return;

    try {
      // Clear mistake counter from inline warnings
      resetMistakeCounts();

      // Clear global state
      await this.context.globalState.update("mistakeCounter", undefined);
      await this.context.globalState.update("debugDuckOnboarded", undefined);

      // Trigger engine reset via command (if engine is available)
      try {
        const { getEngine } = require("../extension");
        const engine = getEngine();
        if (engine) {
          await engine.resetProgress();
        }
      } catch {
        // Engine not available - that's okay, we've cleared the UI state
      }

      vscode.window.showInformationMessage("Progress reset! Fresh start! 🦆");

      // Notify webview
      this.panel?.webview.postMessage({ command: "resetSuccess" });
    } catch (error) {
      vscode.window.showErrorMessage(
        "Failed to reset progress. Please try again.",
      );
      console.error("DebugDuck: Failed to reset progress:", error);
    }
  }

  /**
   * Test if an API key is valid.
   */
  private async testApiKey(apiKey?: string): Promise<void> {
    if (!apiKey) {
      vscode.window.showWarningMessage("Please enter an API key first.");
      return;
    }

    // Show testing indicator
    this.panel?.webview.postMessage({ command: "testingApiKey" });

    try {
      // Try to import and use the Claude client to test the key
      const { ClaudeClient } = await import("../ai/claude");
      const client = new ClaudeClient(apiKey);

      // Make a minimal test call
      // Note: This will use a small amount of API credits
      const testBug = {
        code: "const x = arr[0].name;",
        language: "typescript",
        errorMessage: "Test",
      };

      await client.analyzeCode(testBug, 0);

      vscode.window.showInformationMessage("API key is valid! 🦆");
      this.panel?.webview.postMessage({ command: "apiKeyValid" });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      if (errorMsg.includes("401") || errorMsg.includes("invalid")) {
        vscode.window.showErrorMessage(
          "Invalid API key. Please check and try again.",
        );
      } else if (errorMsg.includes("rate") || errorMsg.includes("429")) {
        vscode.window.showWarningMessage(
          "API rate limited. Key might be valid - try saving anyway.",
        );
      } else {
        vscode.window.showErrorMessage(`API test failed: ${errorMsg}`);
      }

      this.panel?.webview.postMessage({
        command: "apiKeyInvalid",
        error: errorMsg,
      });
    }
  }

  /**
   * Get the HTML content for the settings panel.
   */
  private getHtmlContent(): string {
    // Get current settings values
    const config = vscode.workspace.getConfiguration("debugduck");
    const settingsData = {
      apiKey: config.get<string>("apiKey", ""),
      maxHints: config.get<number>("maxHints", 4),
      enableRealTimeWarnings: config.get<boolean>(
        "enableRealTimeWarnings",
        true,
      ),
    };

    // Try to load template
    const possiblePaths = [
      path.join(
        this.context.extensionPath,
        "src",
        "ui",
        "templates",
        "settings.html",
      ),
      path.join(
        this.context.extensionPath,
        "out",
        "ui",
        "templates",
        "settings.html",
      ),
    ];

    for (const htmlPath of possiblePaths) {
      try {
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, "utf8");

          // Inject settings data
          html = html.replace(
            "const data = window.__DATA__;",
            `const data = ${JSON.stringify(settingsData)};`,
          );

          return html;
        }
      } catch (error) {
        console.error(
          `Failed to read settings template from ${htmlPath}:`,
          error,
        );
      }
    }

    // Fallback HTML
    return this.getFallbackHtml(settingsData);
  }

  /**
   * Fallback HTML if template loading fails.
   */
  private getFallbackHtml(data: {
    apiKey: string;
    maxHints: number;
    enableRealTimeWarnings: boolean;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 24px;
      max-width: 500px;
      margin: 0 auto;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-widget-border);
      margin-bottom: 24px;
    }
    .duck { font-size: 2em; }
    h2 { margin: 0; }
    .field {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 0.75em;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.7;
      margin-bottom: 8px;
    }
    input[type="password"],
    input[type="text"] {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 1em;
    }
    input[type="range"] {
      width: 100%;
      accent-color: var(--vscode-button-background);
    }
    .range-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .range-value {
      font-weight: bold;
      color: var(--vscode-button-background);
    }
    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }
    .checkbox-field input {
      width: 18px;
      height: 18px;
      accent-color: var(--vscode-button-background);
    }
    .actions {
      display: flex;
      gap: 12px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-widget-border);
      margin-top: 24px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1em;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    .primary {
      flex: 1;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .danger {
      background: transparent;
      border: 1px solid #ef4444;
      color: #ef4444;
    }
    .danger:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="duck">🦆</span>
    <h2>Settings</h2>
  </div>

  <div class="field">
    <label>API Key (Anthropic)</label>
    <input type="password" id="apiKey" placeholder="sk-ant-..." value="${data.apiKey}">
  </div>

  <div class="field">
    <div class="range-header">
      <label>Max Hints per Bug</label>
      <span class="range-value" id="maxHintsValue">${data.maxHints}</span>
    </div>
    <input type="range" id="maxHints" min="2" max="6" value="${data.maxHints}">
  </div>

  <div class="field">
    <label class="checkbox-field">
      <input type="checkbox" id="enableRealTimeWarnings" ${data.enableRealTimeWarnings ? "checked" : ""}>
      <span>Enable real-time 🦆 warnings</span>
    </label>
  </div>

  <div class="actions">
    <button class="primary" id="saveBtn">Save Settings</button>
    <button class="danger" id="resetBtn">Reset Progress</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const apiKeyInput = document.getElementById("apiKey");
    const maxHintsInput = document.getElementById("maxHints");
    const maxHintsValue = document.getElementById("maxHintsValue");
    const warningsCheckbox = document.getElementById("enableRealTimeWarnings");

    // Update displayed value when slider changes
    maxHintsInput.addEventListener("input", () => {
      maxHintsValue.textContent = maxHintsInput.value;
    });

    // Save settings
    document.getElementById("saveBtn").addEventListener("click", () => {
      vscode.postMessage({
        command: "saveSettings",
        apiKey: apiKeyInput.value,
        maxHints: parseInt(maxHintsInput.value, 10),
        enableRealTimeWarnings: warningsCheckbox.checked
      });
    });

    // Reset progress
    document.getElementById("resetBtn").addEventListener("click", () => {
      vscode.postMessage({ command: "resetProgress" });
    });

    // Handle messages from extension
    window.addEventListener("message", event => {
      const msg = event.data;
      if (msg.command === "saveSuccess") {
        // Could show a success indicator
      }
    });
  </script>
</body>
</html>`;
  }
}
