/**
 * DebugDuck VS Code Extension
 *
 * Main entry point for the extension. Handles:
 * - Extension activation and deactivation
 * - Command registration
 * - Engine initialization
 * - Real-time diagnostic watching
 * - Status bar management
 */

import * as vscode from "vscode";
import {
  analyzeSelection,
  showDashboard,
  showSettings,
  markSolved,
} from "./ui/commands";
import { InlineWarnings, type Warning } from "./ui/inlineWarnings";
import { Onboarding } from "./ui/onboarding";
import { DebugDuckEngine, createEngine } from "./api";

// =============================================================================
// Global State
// =============================================================================

/** Extension context - exported for use by other modules */
export let extensionContext: vscode.ExtensionContext;

/** The backend engine instance - null if no API key configured */
let engine: DebugDuckEngine | null = null;

/** Active warnings per document URI */
const activeWarnings = new Map<string, InlineWarnings>();

/** Status bar item showing streak */
let statusBarItem: vscode.StatusBarItem;

// =============================================================================
// Engine Access
// =============================================================================

/**
 * Get the current engine instance.
 * Returns null if no API key is configured.
 */
export function getEngine(): DebugDuckEngine | null {
  return engine;
}

/**
 * Initialize or reinitialize the engine with current settings.
 * Called on activation and when settings change.
 */
function initializeEngine(): void {
  // Clean up existing engine
  if (engine) {
    engine.close();
    engine = null;
  }

  // Get API key from settings
  const config = vscode.workspace.getConfiguration("debugduck");
  const apiKey = config.get<string>("apiKey", "");

  if (!apiKey) {
    console.log("DebugDuck: No API key configured");
    updateStatusBar(0);
    return;
  }

  try {
    // Create new engine with settings
    const maxHints = config.get<number>("maxHints", 4);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const baseDir = workspaceFolder
      ? `${workspaceFolder}/.debugduck`
      : ".debugduck";

    engine = createEngine(apiKey, {
      baseDir,
      maxHints,
      storageType: "json", // Use JSON storage for portability
      enableRealTimeWarnings: config.get<boolean>(
        "enableRealTimeWarnings",
        true,
      ),
    });

    console.log("DebugDuck: Engine initialized successfully");

    // Update status bar with real streak
    updateStatusBarFromEngine();
  } catch (error) {
    console.error("DebugDuck: Failed to initialize engine:", error);
    vscode.window.showErrorMessage(
      "DebugDuck failed to initialize. Check your API key.",
    );
  }
}

/**
 * Update status bar with streak from engine.
 */
async function updateStatusBarFromEngine(): Promise<void> {
  if (engine) {
    const profile = engine.getProfile();
    updateStatusBar(profile.streak);
  } else {
    updateStatusBar(0);
  }
}

/**
 * Update the status bar display.
 *
 * @param streak - Current streak in days
 */
function updateStatusBar(streak: number): void {
  if (!statusBarItem) return;

  if (streak > 0) {
    statusBarItem.text = `🦆 DebugDuck | ${streak} day streak`;
  } else {
    statusBarItem.text = "🦆 DebugDuck";
  }
}

// =============================================================================
// Extension Activation
// =============================================================================

/**
 * Called when the extension is activated.
 * Sets up commands, UI elements, and event listeners.
 */
export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  console.log("DebugDuck activated! QUACK QUACK 🦆");

  // --- STATUS BAR ---
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "🦆 DebugDuck";
  statusBarItem.tooltip = "Click to open DebugDuck Dashboard";
  statusBarItem.command = "debugduck.showDashboard";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // --- INITIALIZE ENGINE ---
  initializeEngine();

  // --- ONBOARDING (first time users) ---
  new Onboarding(context).show();

  // --- REGISTER COMMANDS ---
  const commands = [
    vscode.commands.registerCommand("debugduck.analyze", () =>
      analyzeSelection(context, activeWarnings),
    ),
    vscode.commands.registerCommand("debugduck.showDashboard", () =>
      showDashboard(context),
    ),
    vscode.commands.registerCommand("debugduck.showSettings", () =>
      showSettings(context),
    ),
    vscode.commands.registerCommand("debugduck.markSolved", () => markSolved()),
    vscode.commands.registerCommand("debugduck.resetProgress", async () => {
      const choice = await vscode.window.showWarningMessage(
        "Reset all DebugDuck learning progress? This cannot be undone.",
        "Reset",
        "Cancel",
      );
      if (choice === "Reset" && engine) {
        await engine.resetProgress();
        updateStatusBar(0);
        vscode.window.showInformationMessage("Progress reset. Fresh start! 🦆");
      }
    }),
  ];

  // --- DIAGNOSTIC WATCHER (Real-time warnings from VS Code) ---
  const diagnosticWatcher = vscode.languages.onDidChangeDiagnostics((event) => {
    const config = vscode.workspace.getConfiguration("debugduck");
    const isEnabled = config.get<boolean>("enableRealTimeWarnings", true);

    // If disabled, clear all warnings
    if (!isEnabled) {
      clearAllWarnings();
      return;
    }

    // Process changed URIs
    for (const uri of event.uris) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== uri.toString()) {
        continue;
      }

      const diagnostics = vscode.languages.getDiagnostics(uri);
      const documentUri = uri.toString();

      // Get or create warnings instance for this document
      let inlineWarnings = activeWarnings.get(documentUri);
      if (!inlineWarnings) {
        inlineWarnings = new InlineWarnings();
        activeWarnings.set(documentUri, inlineWarnings);
      }

      // No diagnostics? Clear warnings
      if (diagnostics.length === 0) {
        inlineWarnings.clearWarnings(editor.document);
        activeWarnings.delete(documentUri);
        continue;
      }

      // Convert VS Code diagnostics to DebugDuck warnings
      const warnings: Warning[] = diagnostics.map((diagnostic) => ({
        id: crypto.randomUUID(),
        type: categorizeDiagnostic(diagnostic.message),
        range: diagnostic.range,
        message: summarizeError(diagnostic.message),
        suggestion: getSuggestionForError(diagnostic.message),
      }));

      inlineWarnings.applyWarnings(editor.document, warnings, true);
    }
  });

  // --- SETTINGS CHANGE LISTENER ---
  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    // Reinitialize engine if API key or core settings change
    if (
      event.affectsConfiguration("debugduck.apiKey") ||
      event.affectsConfiguration("debugduck.maxHints")
    ) {
      initializeEngine();
    }

    // Handle real-time warnings toggle
    if (event.affectsConfiguration("debugduck.enableRealTimeWarnings")) {
      const isEnabled = vscode.workspace
        .getConfiguration("debugduck")
        .get("enableRealTimeWarnings");

      if (!isEnabled) {
        clearAllWarnings();
        vscode.window.showInformationMessage("Real-time warnings disabled 💨");
      } else {
        vscode.window.showInformationMessage("Real-time warnings enabled! 🦆");
      }
    }
  });

  // --- REGISTER ALL DISPOSABLES ---
  context.subscriptions.push(...commands, diagnosticWatcher, configWatcher);

  // Show welcome message
  vscode.window.showInformationMessage(
    "DebugDuck is ready to help you learn! 🦆",
  );
}

// =============================================================================
// Extension Deactivation
// =============================================================================

/**
 * Called when the extension is deactivated.
 * Cleans up resources.
 */
export function deactivate(): void {
  // Clean up engine
  if (engine) {
    engine.close();
    engine = null;
  }

  // Clear all warnings
  clearAllWarnings();

  console.log("DebugDuck deactivated. Goodbye! 🦆");
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Clear all active warnings from all documents.
 */
function clearAllWarnings(): void {
  for (const [uri, warnings] of activeWarnings) {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === uri,
    );
    if (editor) {
      warnings.clearWarnings(editor.document);
    }
  }
  activeWarnings.clear();
}

/**
 * Categorize a diagnostic message into a bug type.
 *
 * @param message - The diagnostic message
 * @returns Bug type string
 */
function categorizeDiagnostic(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("undefined") ||
    lowerMessage.includes("not defined")
  ) {
    return "undefined-access";
  }
  if (lowerMessage.includes("null")) {
    return "null-reference";
  }
  if (lowerMessage.includes("type") || lowerMessage.includes("assignable")) {
    return "type-mismatch";
  }
  if (lowerMessage.includes("await") || lowerMessage.includes("promise")) {
    return "async-await";
  }
  if (
    lowerMessage.includes("property") &&
    lowerMessage.includes("does not exist")
  ) {
    return "undefined-access";
  }

  return "general-error";
}

/**
 * Create a short summary of an error message.
 *
 * @param message - The full error message
 * @returns Shortened summary
 */
function summarizeError(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("undefined")) return "Might be undefined";
  if (lowerMessage.includes("null")) return "Might be null";
  if (lowerMessage.includes("type")) return "Type issue";
  if (lowerMessage.includes("await")) return "Missing await?";
  if (lowerMessage.includes("property")) return "Property access issue";

  // Truncate long messages
  return message.length > 30 ? message.substring(0, 30) + "..." : message;
}

/**
 * Get a suggestion for fixing an error based on its message.
 *
 * @param message - The error message
 * @returns Suggestion string
 */
function getSuggestionForError(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("undefined")) {
    return "Use optional chaining (?.) or add a null check";
  }
  if (lowerMessage.includes("null")) {
    return "Add a null check before accessing";
  }
  if (lowerMessage.includes("type")) {
    return "Check your types match the expected signature";
  }
  if (lowerMessage.includes("await")) {
    return "Make sure to await the Promise";
  }
  if (lowerMessage.includes("property")) {
    return "Verify the property exists on the object";
  }

  return "Review the code for potential issues";
}
