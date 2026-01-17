import * as vscode from "vscode";

export class SettingsUI {
  private panel?: vscode.WebviewPanel;

  constructor(private context: vscode.ExtensionContext) {}

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "debugDuckSettings",
      "DebugDuck Settings 🦆",
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case "saveSettings":
            await vscode.workspace.getConfiguration("debugDuck").update(
              "apiKey",
              message.apiKey,
              vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration("debugDuck").update(
              "maxHints",
              message.maxHints,
              vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration("debugDuck").update(
              "realTimeWarnings",
              message.realTimeWarnings,
              vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage("DebugDuck settings saved! 🦆");
            break;
          case "resetProgress":
            vscode.window.showWarningMessage(
              "Reset DebugDuck progress? This cannot be undone.",
              "Reset", "Cancel"
            ).then(selection => {
              if (selection === "Reset") {
                vscode.window.showInformationMessage("Progress Reset! 🦆");
              }
            });
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getHtml(): string {
    const config = vscode.workspace.getConfiguration("debugDuck");
    const apiKey = config.get("apiKey", "");
    const maxHints = config.get("maxHints", 5);
    const realTimeWarnings = config.get("realTimeWarnings", true);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>DebugDuck Settings 🦆</title>
        <style>
          body { font-family: sans-serif; padding: 1em; }
          label { display: block; margin-top: 1em; }
          input, button, select { margin-top: 0.5em; }
          button { margin-right: 0.5em; }
        </style>
      </head>
      <body>
        <h2>DebugDuck Settings 🦆</h2>
        <label>API Key:
          <input type="text" id="apiKey" value="${apiKey}" style="width: 100%">
        </label>

        <label>Max Hints:
          <input type="range" id="maxHints" min="1" max="10" value="${maxHints}">
          <span id="maxHintsValue">${maxHints}</span>
        </label>

        <label>
          <input type="checkbox" id="realTimeWarnings" ${realTimeWarnings ? "checked" : ""}>
          Enable real-time warnings
        </label>

        <div style="margin-top: 1em;">
          <button id="saveBtn">Save Settings</button>
          <button id="resetBtn">Reset Progress</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const maxHintsInput = document.getElementById('maxHints');
          const maxHintsValue = document.getElementById('maxHintsValue');
          maxHintsInput.addEventListener('input', () => {
            maxHintsValue.textContent = maxHintsInput.value;
          });

          document.getElementById('saveBtn').addEventListener('click', () => {
            vscode.postMessage({
              command: 'saveSettings',
              apiKey: document.getElementById('apiKey').value,
              maxHints: Number(maxHintsInput.value),
              realTimeWarnings: document.getElementById('realTimeWarnings').checked
            });
          });

          document.getElementById('resetBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'resetProgress' });
          });
        </script>
      </body>
      </html>
    `;
  }
}
