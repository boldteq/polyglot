import * as vscode from 'vscode';
import { runOrchestration } from '../api';
import type { Orchestration, SSEEvent } from '../types';

interface WebviewMessage {
  type: 'run' | 'copy';
  task?: string;
  text?: string;
}

export class OrchestrationPanel {
  public static currentPanel: OrchestrationPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly orchestration: Orchestration;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, orchestration: Orchestration) {
    this.panel = panel;
    this.orchestration = orchestration;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        if (message.type === 'run' && message.task) {
          this.handleRun(message.task);
        } else if (message.type === 'copy' && message.text) {
          await vscode.env.clipboard.writeText(message.text);
          void vscode.window.showInformationMessage('Copied to clipboard');
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(orchestration: Orchestration, extensionUri: vscode.Uri): void {
    const column = vscode.ViewColumn.Beside;

    if (OrchestrationPanel.currentPanel) {
      OrchestrationPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'polyglot.orchestrationRunner',
      `Pipeline: ${orchestration.name}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    OrchestrationPanel.currentPanel = new OrchestrationPanel(panel, orchestration);
  }

  private handleRun(task: string): void {
    void this.panel.webview.postMessage({ type: 'status', status: 'running' });

    runOrchestration(
      this.orchestration,
      task,
      (event: SSEEvent) => {
        void this.panel.webview.postMessage({ type: 'event', event });
      },
      () => {
        void this.panel.webview.postMessage({ type: 'done' });
      },
      (err: string) => {
        void this.panel.webview.postMessage({ type: 'error', error: err });
      }
    );
  }

  private getHtml(): string {
    const nonce = getNonce();
    const nodeList = this.orchestration.nodes
      .map((n) => `<div class="node" id="node-${escapeHtml(n.id)}">
        <span class="node-icon">&#9679;</span>
        <span class="node-label">${escapeHtml(n.data?.label || n.id)}</span>
        <span class="node-status"></span>
      </div>`)
      .join('\n');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }
    .pipeline-header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .pipeline-header h2 {
      font-size: 16px;
      font-weight: 600;
    }
    .pipeline-header .meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .nodes-section {
      margin-bottom: 16px;
    }
    .nodes-section h3 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      margin-bottom: 4px;
      border-radius: 4px;
      background: var(--vscode-list-hoverBackground);
      font-size: 13px;
    }
    .node-icon { color: var(--vscode-descriptionForeground); font-size: 10px; }
    .node-status { margin-left: auto; font-size: 11px; }
    .node.running { background: var(--vscode-inputValidation-infoBackground); }
    .node.running .node-icon { color: var(--vscode-progressBar-background); }
    .node.done { background: var(--vscode-inputValidation-infoBackground); }
    .node.done .node-icon { color: var(--vscode-testing-iconPassed); }
    .node.error .node-icon { color: var(--vscode-testing-iconFailed); }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 10px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      resize: vertical;
      outline: none;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    .actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
    }
    button {
      padding: 6px 14px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .log-section {
      margin-top: 20px;
    }
    .log-section h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .log-entry {
      padding: 8px 10px;
      margin-bottom: 4px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-size: 12px;
      border-left: 3px solid var(--vscode-widget-border);
    }
    .log-entry.done { border-left-color: var(--vscode-testing-iconPassed); }
    .log-entry.error { border-left-color: var(--vscode-testing-iconFailed); }
    .log-entry .label { font-weight: 600; }
    .log-entry .preview {
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      white-space: pre-wrap;
      max-height: 120px;
      overflow-y: auto;
    }
    .final-output {
      margin-top: 20px;
    }
    .final-output h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .output-box {
      padding: 12px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="pipeline-header">
    <h2>${escapeHtml(this.orchestration.name)}</h2>
    <div class="meta">${this.orchestration.nodes.length} nodes &middot; ${this.orchestration.edges.length} edges</div>
  </div>

  <div class="nodes-section">
    <h3>Pipeline</h3>
    ${nodeList}
  </div>

  <textarea id="task" placeholder="Enter your task..." autofocus></textarea>

  <div class="actions">
    <button id="runBtn">Run Pipeline</button>
    <button id="copyBtn" class="secondary" style="display:none">Copy Final Output</button>
  </div>

  <div id="logSection" class="log-section" style="display:none">
    <h3>Run Log</h3>
    <div id="logEntries"></div>
  </div>

  <div id="finalSection" class="final-output" style="display:none">
    <h3>Final Output</h3>
    <div id="finalBox" class="output-box"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const task = document.getElementById('task');
    const runBtn = document.getElementById('runBtn');
    const copyBtn = document.getElementById('copyBtn');
    const logSection = document.getElementById('logSection');
    const logEntries = document.getElementById('logEntries');
    const finalSection = document.getElementById('finalSection');
    const finalBox = document.getElementById('finalBox');

    let finalOutput = '';

    runBtn.addEventListener('click', () => {
      const text = task.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'run', task: text });
    });

    task.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        runBtn.click();
      }
    });

    copyBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: finalOutput });
    });

    function resetNodes() {
      document.querySelectorAll('.node').forEach(n => {
        n.className = 'node';
        n.querySelector('.node-status').textContent = '';
      });
    }

    function updateNode(nodeId, status, statusText) {
      const el = document.getElementById('node-' + nodeId);
      if (el) {
        el.className = 'node ' + status;
        el.querySelector('.node-status').textContent = statusText;
      }
    }

    function addLog(label, type, content) {
      const entry = document.createElement('div');
      entry.className = 'log-entry ' + type;
      entry.innerHTML =
        '<div class="label">' + label + ' — ' + type + '</div>' +
        (content ? '<div class="preview">' + escapeHtml(content.slice(0, 500)) + '</div>' : '');
      logEntries.appendChild(entry);
      entry.scrollIntoView({ behavior: 'smooth' });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;

      if (msg.type === 'status' && msg.status === 'running') {
        runBtn.disabled = true;
        logSection.style.display = 'block';
        logEntries.innerHTML = '';
        finalSection.style.display = 'none';
        copyBtn.style.display = 'none';
        resetNodes();
      }

      if (msg.type === 'event') {
        const ev = msg.event;
        if (ev.type === 'start') {
          updateNode(ev.nodeId, 'running', 'running...');
          addLog(ev.label || ev.nodeId, 'start', '');
        } else if (ev.type === 'done') {
          updateNode(ev.nodeId, 'done', 'done');
          addLog(ev.label || ev.nodeId, 'done', ev.output || '');
        } else if (ev.type === 'error') {
          updateNode(ev.nodeId, 'error', 'error');
          addLog(ev.label || ev.nodeId, 'error', ev.error || '');
        } else if (ev.type === 'complete') {
          finalOutput = ev.finalOutput || '';
          if (finalOutput) {
            finalSection.style.display = 'block';
            finalBox.textContent = finalOutput;
            copyBtn.style.display = 'inline-block';
          }
        }
      }

      if (msg.type === 'done') {
        runBtn.disabled = false;
      }

      if (msg.type === 'error') {
        runBtn.disabled = false;
        addLog('System', 'error', msg.error);
      }
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    OrchestrationPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
