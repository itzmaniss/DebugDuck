import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export class SettingsUI {
  private panel?: vscode.WebviewPanel;

  constructor(private context: vscode.ExtensionContext) {}

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create the Webview Panel
    this.panel = vscode.window.createWebviewPanel(
      "debugDuckSettings",
      "DebugDuck Settings 🦆",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "src", "ui", "templates"))
        ]
      }
    );

    // Set the HTML content
    this.panel.webview.html = this.getHtml();

    // Handle messages sent from the Webview (the HTML/JS side)
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        const config = vscode.workspace.getConfiguration("debugduck");

        switch (message.command) {
            // Inside your settingsUI.ts message handler
            case "saveSettings":
                
                // Use Promise.all to ensure all updates finish
                await Promise.all([
                    config.update("apiKey", message.apiKey, vscode.ConfigurationTarget.Global),
                    config.update("maxHints", message.maxHints, vscode.ConfigurationTarget.Global),
                    config.update("realTimeWarnings", message.realTimeWarnings, vscode.ConfigurationTarget.Global)
                ]);
                
                vscode.window.showInformationMessage("DebugDuck settings saved! 🦆");
                break;

          case "resetProgress":
            const choice = await vscode.window.showWarningMessage(
              "Reset DebugDuck progress? This cannot be undone.",
              "Reset",
              "Cancel"
            );
            
            if (choice === "Reset") {
              // Clear the global state counter
              await this.context.globalState.update("mistakeCounter", undefined);
              vscode.window.showInformationMessage("Progress Reset! 🦆");
            }
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Cleanup when panel is closed
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.context.subscriptions);
  }


  private getHtml(): string {
    const config = vscode.workspace.getConfiguration("debugduck");

    const settingsData = {
      apiKey: config.get("apiKey", ""),
      maxHints: config.get("maxHints", 5),
      realTimeWarnings: config.get("realTimeWarnings", true)
    };

    const htmlPath = path.join(
      this.context.extensionPath,
      "src",
      "ui",
      "templates",
      "settings.html"
    );

    try {
      let html = fs.readFileSync(htmlPath, "utf8");

      html = html.replace(
        "const data = window.__DATA__;",
        `const data = ${JSON.stringify(settingsData)};`
      );

      return html;
    } catch (err) {
      console.error("Failed to read settings.html", err);
      return `<html><body><h1>Error</h1><p>Could not load settings template from ${htmlPath}</p></body></html>`;
    }
  }
}