import * as vscode from "vscode";

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
    const injectedHints = this.analysisResult?.hints ?? [];

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-900 text-neutral-100 p-4">
  <div class="max-w-xl mx-auto space-y-4">
    <div class="text-5xl">🦆</div>
    <h2 class="text-xl font-semibold">Let's debug together</h2>

    <pre class="bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
${escapeHtml(this.analysisResult?.selectedCode ?? "")}
    </pre>

    <div id="hints-list" class="space-y-2"></div>

    <div class="flex gap-2">
      <button id="next-hint" class="px-3 py-1 bg-yellow-500 text-black rounded">
        💡 Next Hint
      </button>
      <button id="give-up" class="px-3 py-1 bg-red-500 rounded">
        🏳️ Show Solution
      </button>
      <button id="solved" class="px-3 py-1 bg-green-500 rounded">
        ✅ I Fixed It!
      </button>
    </div>

    <div class="text-sm text-neutral-400 progress"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const hints = ${JSON.stringify(injectedHints)};
    let index = 0;

    function render() {
      const list = document.getElementById("hints-list");
      list.innerHTML = "";

      if (hints.length === 0) {
        list.textContent = "No hints available.";
        return;
      }

      for (let i = 0; i <= index; i++) {
        const p = document.createElement("p");
        p.textContent = hints[i].hint;
        list.appendChild(p);
      }

      document.querySelector(".progress").textContent =
        "Hint " + (index + 1) + "/" + hints.length;
    }

    document.getElementById("next-hint").onclick =
      () => vscode.postMessage({ command: "nextHint" });

    document.getElementById("give-up").onclick =
      () => vscode.postMessage({ command: "giveUp" });

    document.getElementById("solved").onclick =
      () => vscode.postMessage({ command: "solved" });

    window.addEventListener("message", e => {
      if (e.data.command === "update") {
        index = e.data.hintIndex;
        render();
      }
      if (e.data.command === "showSolution") {
        alert(e.data.solution);
      }
    });

    render();
  </script>
</body>
</html>
`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
