// extension activaiton and commands
import { analyzeSelection, showDashboard } from "./ui/commands";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // FUTURE UPDATE: add a feature to go to main dashboard
  console.log("DebugDuck has run!!!! QUACK QUACK");
  vscode.window.showInformationMessage("DebugDuck is now active QUACK!");

  const analyzeCmd = vscode.commands.registerCommand(
    "debugduck.analyze",
    () => analyzeSelection(context)
  );
  
  const dashboardCmd = vscode.commands.registerCommand(
    "debugduck.showDashboard",
    () => showDashboard(context)
  );

  const dailyReviewCmd = vscode.commands.registerCommand(
    "debugduck.dailyReview",
    () => {
      vscode.window.showInformationMessage("Daily Review coming soon! 🦆");
    }
  );

  const resetProgressCmd = vscode.commands.registerCommand(
    "debugduck.resetProgress",
    () => {
      vscode.window.showWarningMessage(
        "Reset Progress? This cannot be undone QUACK!!!",
        "Reset", "Cancel").then(selection => {
          if (selection == "Reset"){
            vscode.window.showInformationMessage("Progress Reset! 🦆");
          }
        });
    }
  );

  context.subscriptions.push(analyzeCmd, dashboardCmd, dailyReviewCmd, resetProgressCmd);
}

export function deactivate() {
  // No cleanup needed for V1
}