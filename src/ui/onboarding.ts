/**
 * DebugDuck Onboarding
 *
 * First-time user experience that:
 * - Welcomes new users
 * - Collects API key
 * - Explains the extension's value proposition
 */

import * as vscode from "vscode";

// =============================================================================
// Onboarding Class
// =============================================================================

/**
 * Manages the onboarding experience for new users.
 * Only shows once per installation.
 *
 * Usage:
 * ```typescript
 * const onboarding = new Onboarding(context);
 * onboarding.show(); // Only shows if user hasn't completed onboarding
 * ```
 */
export class Onboarding {
  private panel?: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Show the onboarding panel if user hasn't completed it yet.
   */
  show(): void {
    // Check if user has already completed onboarding
    const hasOnboarded =
      this.context.globalState.get<boolean>("debugDuckOnboarded");
    if (hasOnboarded) {
      return;
    }

    // Create onboarding panel
    this.panel = vscode.window.createWebviewPanel(
      "debugDuckOnboarding",
      "Welcome to DebugDuck 🦆",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

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
  }

  /**
   * Force show onboarding (for testing or reset).
   */
  forceShow(): void {
    this.context.globalState.update("debugDuckOnboarded", false);
    this.show();
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
  }): Promise<void> {
    switch (message.command) {
      case "enterKey":
        await this.saveApiKeyAndComplete(message.apiKey);
        break;

      case "learnMore":
        // Open documentation/GitHub
        vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/itzmaniss/debugduck"),
        );
        break;

      case "skip":
        await this.completeOnboarding();
        break;
    }
  }

  /**
   * Save API key and complete onboarding.
   */
  private async saveApiKeyAndComplete(apiKey?: string): Promise<void> {
    if (apiKey && apiKey.trim()) {
      // Save API key to settings
      const config = vscode.workspace.getConfiguration("debugduck");
      await config.update(
        "apiKey",
        apiKey.trim(),
        vscode.ConfigurationTarget.Global,
      );
      vscode.window.showInformationMessage(
        "API key saved! You're ready to debug! 🦆",
      );
    } else {
      vscode.window.showWarningMessage(
        "No API key entered. You can add one later in Settings.",
      );
    }

    await this.completeOnboarding();
  }

  /**
   * Mark onboarding as complete and close panel.
   */
  private async completeOnboarding(): Promise<void> {
    await this.context.globalState.update("debugDuckOnboarded", true);
    this.panel?.dispose();
  }

  /**
   * Get HTML content for the onboarding panel.
   */
  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      padding: 0;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 500px;
      padding: 48px 32px;
      text-align: center;
    }
    .duck {
      font-size: 72px;
      margin-bottom: 16px;
      animation: bounce 2s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    h1 {
      font-size: 2em;
      margin: 0 0 8px 0;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.1em;
      opacity: 0.8;
      margin-bottom: 32px;
    }
    .features {
      text-align: left;
      margin: 24px 0;
      padding: 20px;
      background: var(--vscode-editorWidget-background);
      border-radius: 12px;
      border: 1px solid var(--vscode-widget-border);
    }
    .feature {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .feature:last-child {
      margin-bottom: 0;
    }
    .feature-icon {
      font-size: 1.2em;
      flex-shrink: 0;
    }
    .feature-text {
      font-size: 0.95em;
      line-height: 1.4;
    }
    .api-section {
      margin: 32px 0;
    }
    .api-label {
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.7;
      margin-bottom: 8px;
      text-align: left;
    }
    input {
      width: 100%;
      padding: 14px 16px;
      font-size: 1em;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: var(--vscode-button-background);
    }
    input::placeholder {
      opacity: 0.5;
    }
    .api-hint {
      font-size: 0.8em;
      opacity: 0.6;
      margin-top: 8px;
      text-align: left;
    }
    .api-hint a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    .api-hint a:hover {
      text-decoration: underline;
    }
    .buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }
    button {
      width: 100%;
      padding: 14px 24px;
      font-size: 1em;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover {
      transform: translateY(-1px);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--vscode-widget-border);
      color: var(--vscode-foreground);
    }
    .btn-secondary:hover {
      background: var(--vscode-editorWidget-background);
    }
    .btn-link {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      padding: 8px;
      font-weight: normal;
    }
    .btn-link:hover {
      text-decoration: underline;
      transform: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="duck">🦆</div>
    <h1>Welcome to DebugDuck!</h1>
    <p class="tagline">Learn to debug through progressive hints, not copy-paste solutions.</p>

    <div class="features">
      <div class="feature">
        <span class="feature-icon">💡</span>
        <span class="feature-text"><strong>Progressive Hints</strong> — Get guided hints that help you discover solutions yourself</span>
      </div>
      <div class="feature">
        <span class="feature-icon">📊</span>
        <span class="feature-text"><strong>Pattern Tracking</strong> — Learn from your mistakes and see your improvement over time</span>
      </div>
      <div class="feature">
        <span class="feature-icon">⚡</span>
        <span class="feature-text"><strong>Real-time Warnings</strong> — Get alerted before making mistakes you've made before</span>
      </div>
    </div>

    <div class="api-section">
      <div class="api-label">Anthropic API Key</div>
      <input
        type="password"
        id="apiKey"
        placeholder="sk-ant-api03-..."
        autocomplete="off"
      >
      <p class="api-hint">
        Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a>
      </p>
    </div>

    <div class="buttons">
      <button class="btn-primary" id="enterKey">
        🚀 Get Started
      </button>
      <button class="btn-secondary" id="skip">
        Skip for Now
      </button>
      <button class="btn-link" id="learnMore">
        Learn more about DebugDuck →
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const apiKeyInput = document.getElementById('apiKey');

    // Get Started button
    document.getElementById('enterKey').addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      vscode.postMessage({ command: 'enterKey', apiKey });
    });

    // Enter key submits
    apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const apiKey = apiKeyInput.value.trim();
        vscode.postMessage({ command: 'enterKey', apiKey });
      }
    });

    // Skip button
    document.getElementById('skip').addEventListener('click', () => {
      vscode.postMessage({ command: 'skip' });
    });

    // Learn More button
    document.getElementById('learnMore').addEventListener('click', () => {
      vscode.postMessage({ command: 'learnMore' });
    });

    // Focus input on load
    apiKeyInput.focus();
  </script>
</body>
</html>`;
  }
}
