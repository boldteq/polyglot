import * as vscode from 'vscode';
import { runAgent } from '../api';
import type { Agent } from '../types';

interface WebviewMessage {
  type: 'run' | 'copy';
  prompt?: string;
  text?: string;
}

export class AgentPanel {
  public static currentPanel: AgentPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly agent: Agent;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, agent: Agent) {
    this.panel = panel;
    this.agent = agent;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        if (message.type === 'run' && message.prompt) {
          await this.handleRun(message.prompt);
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

  static show(agent: Agent, extensionUri: vscode.Uri): void {
    const column = vscode.ViewColumn.Beside;

    if (AgentPanel.currentPanel) {
      AgentPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'polyglot.agentRunner',
      `Agent: ${agent.name}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    AgentPanel.currentPanel = new AgentPanel(panel, agent);
  }

  private async handleRun(prompt: string): Promise<void> {
    void this.panel.webview.postMessage({ type: 'status', status: 'running' });

    const result = await runAgent(this.agent.name.toLowerCase(), prompt);

    void this.panel.webview.postMessage({
      type: 'result',
      success: result.success,
      output: result.output,
      error: result.error,
    });
  }

  private getHtml(): string {
    const nonce = getNonce();
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
    .agent-header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .agent-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .agent-header .desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .agent-header .model {
      font-size: 11px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-block;
      margin-top: 6px;
    }
    textarea {
      width: 100%;
      min-height: 100px;
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
    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }
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
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .output-section {
      margin-top: 20px;
    }
    .output-section h3 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .output-box {
      padding: 12px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 500px;
      overflow-y: auto;
    }
    .output-box.error {
      border-color: var(--vscode-errorForeground);
      color: var(--vscode-errorForeground);
    }
    .status-running {
      color: var(--vscode-progressBar-background);
      font-size: 13px;
      margin-top: 12px;
    }
    .status-running::after {
      content: '...';
      animation: dots 1.5s infinite;
    }
    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }
  </style>
</head>
<body>
  <div class="agent-header">
    <h2>${escapeHtml(this.agent.name)}</h2>
    <div class="desc">${escapeHtml(this.agent.description || 'No description')}</div>
    ${this.agent.model ? `<span class="model">${escapeHtml(this.agent.model)}</span>` : ''}
  </div>

  <textarea id="prompt" placeholder="Enter your task for ${escapeHtml(this.agent.name)}..." autofocus></textarea>

  <div class="actions">
    <button id="runBtn">Run Agent</button>
    <button id="copyBtn" class="secondary" style="display:none">Copy Output</button>
  </div>

  <div id="statusEl" class="status-running" style="display:none">Running ${escapeHtml(this.agent.name)}</div>

  <div id="outputSection" class="output-section" style="display:none">
    <h3>Output</h3>
    <div id="outputBox" class="output-box"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const prompt = document.getElementById('prompt');
    const runBtn = document.getElementById('runBtn');
    const copyBtn = document.getElementById('copyBtn');
    const statusEl = document.getElementById('statusEl');
    const outputSection = document.getElementById('outputSection');
    const outputBox = document.getElementById('outputBox');

    let lastOutput = '';

    runBtn.addEventListener('click', () => {
      const text = prompt.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'run', prompt: text });
    });

    prompt.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        runBtn.click();
      }
    });

    copyBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: lastOutput });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'status' && msg.status === 'running') {
        runBtn.disabled = true;
        statusEl.style.display = 'block';
        outputSection.style.display = 'none';
        copyBtn.style.display = 'none';
      } else if (msg.type === 'result') {
        runBtn.disabled = false;
        statusEl.style.display = 'none';
        outputSection.style.display = 'block';
        if (msg.success) {
          outputBox.className = 'output-box';
          outputBox.textContent = msg.output;
          lastOutput = msg.output;
          copyBtn.style.display = 'inline-block';
        } else {
          outputBox.className = 'output-box error';
          outputBox.textContent = msg.error || 'Unknown error';
          copyBtn.style.display = 'none';
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    AgentPanel.currentPanel = undefined;
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
