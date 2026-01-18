import * as vscode from "vscode";

export class Onboarding {
  private panel?: vscode.WebviewPanel;

  constructor(private context: vscode.ExtensionContext) {}

  show() {
    // Only show onboarding on first activation
    const firstTime = !this.context.globalState.get("debugDuckOnboarded");
    if (!firstTime) return;

    this.panel = vscode.window.createWebviewPanel(
      "debugDuckOnboarding",
      "Welcome to DebugDuck 🦆",
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case "enterKey":
          vscode.window.showInformationMessage("API Key saved! 🦆");
          this.context.globalState.update("debugDuckOnboarded", true);
          this.panel?.dispose();
          break;
        case "learnMore":
          vscode.env.openExternal(
            vscode.Uri.parse("https://your-docs-link-here.com")
          );
          break;
        case "skip":
          this.context.globalState.update("debugDuckOnboarded", true);
          this.panel?.dispose();
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Welcome to DebugDuck 🦆</title>
        <style>
          body { font-family: sans-serif; padding: 2em; text-align: center; }
          h1 { font-size: 1.5em; margin-bottom: 1em; }
          button { margin: 0.5em; padding: 0.5em 1em; font-size: 1em; }
          input { padding: 0.3em; width: 80%; margin-bottom: 1em; }
        </style>
      </head>
      <body>
        <h1>Welcome to DebugDuck! 🦆</h1>
        <p>I'll teach you to debug through progressive hints.</p>
        <input type="text" id="apiKey" placeholder="Enter API Key" /><br/>
        <button id="enterKey">Enter API Key</button>
        <button id="learnMore">Learn More</button>
        <button id="skip">Skip</button>

        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('enterKey').addEventListener('click', () => {
            const key = document.getElementById('apiKey').value;
            vscode.postMessage({ command: 'enterKey', apiKey: key });
          });
          document.getElementById('learnMore').addEventListener('click', () => {
            vscode.postMessage({ command: 'learnMore' });
          });
          document.getElementById('skip').addEventListener('click', () => {
            vscode.postMessage({ command: 'skip' });
          });
        </script>
      </body>
      </html>
    `;
  }
}
