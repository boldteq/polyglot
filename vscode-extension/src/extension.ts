import * as vscode from 'vscode';
import { AgentsProvider, AgentTreeItem } from './providers/agentsProvider';
import { OrchestrationsProvider, OrchestrationTreeItem } from './providers/orchestrationsProvider';
import { HistoryProvider, HistoryTreeItem } from './providers/historyProvider';
import { AgentPanel } from './panels/agentPanel';
import { OrchestrationPanel } from './panels/orchestrationPanel';
import { checkHealth, fetchAgents, fetchRunDetail } from './api';
import type { RunDetail } from './types';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── Status bar ──
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = 'polyglot.checkStatus';
  context.subscriptions.push(statusBarItem);

  // ── Tree providers ──
  const agentsProvider = new AgentsProvider();
  const orchestrationsProvider = new OrchestrationsProvider();
  const historyProvider = new HistoryProvider();

  vscode.window.registerTreeDataProvider('polyglot.agents', agentsProvider);
  vscode.window.registerTreeDataProvider('polyglot.orchestrations', orchestrationsProvider);
  vscode.window.registerTreeDataProvider('polyglot.history', historyProvider);

  // ── Commands ──

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.refreshAgents', () => {
      agentsProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.refreshOrchestrations', () => {
      orchestrationsProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.refreshHistory', () => {
      historyProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.runAgent', async (item?: AgentTreeItem) => {
      let agent = item?.agent;

      if (!agent) {
        // Quick pick if not called from tree
        try {
          const agents = await fetchAgents();
          const picked = await vscode.window.showQuickPick(
            agents.map((a) => ({
              label: a.name,
              description: a.model || '',
              detail: a.description || '',
              agent: a,
            })),
            { placeHolder: 'Select an agent to run' }
          );
          if (!picked) return;
          agent = picked.agent;
        } catch {
          void vscode.window.showErrorMessage('Cannot connect to Polyglot. Is it running?');
          return;
        }
      }

      if (!agent || !agent.filename) return;

      AgentPanel.show(agent, context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.runOrchestration', async (item?: OrchestrationTreeItem) => {
      let orchestration = item?.orchestration;

      if (!orchestration) {
        const { fetchOrchestrations } = await import('./api');
        try {
          const orcs = await fetchOrchestrations();
          if (orcs.length === 0) {
            void vscode.window.showInformationMessage('No orchestrations saved. Create one in Polyglot first.');
            return;
          }
          const picked = await vscode.window.showQuickPick(
            orcs.map((o) => ({
              label: o.name,
              description: `${o.nodes.length} nodes`,
              detail: `ID: ${o.id}`,
              orchestration: o,
            })),
            { placeHolder: 'Select a pipeline to run' }
          );
          if (!picked) return;
          orchestration = picked.orchestration;
        } catch {
          void vscode.window.showErrorMessage('Cannot connect to Polyglot. Is it running?');
          return;
        }
      }

      if (!orchestration || !orchestration.id) return;

      OrchestrationPanel.show(orchestration, context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.viewRunDetail', async (item?: HistoryTreeItem) => {
      if (!item?.run?.id) return;

      try {
        const detail = await fetchRunDetail(item.run.id);
        const doc = await vscode.workspace.openTextDocument({
          content: formatRunDetail(detail),
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        void vscode.window.showErrorMessage('Failed to load run details');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.openHub', () => {
      const url = vscode.workspace.getConfiguration('polyglot').get<string>('serverUrl') || 'http://localhost:3847';
      void vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polyglot.checkStatus', async () => {
      const online = await checkHealth();
      if (online) {
        statusBarItem.text = '$(check) Polyglot';
        statusBarItem.tooltip = 'Polyglot is running';
        statusBarItem.color = undefined;
        void vscode.window.showInformationMessage('Polyglot is online and connected.');
      } else {
        statusBarItem.text = '$(error) Polyglot';
        statusBarItem.tooltip = 'Polyglot is not reachable';
        statusBarItem.color = new vscode.ThemeColor('errorForeground');
        void vscode.window.showWarningMessage('Polyglot is not reachable. Check if the server is running.');
      }
    })
  );

  // ── Auto-connect on startup ──
  const autoConnect = vscode.workspace.getConfiguration('polyglot').get<boolean>('autoConnect');
  if (autoConnect) {
    const online = await checkHealth();
    if (online) {
      statusBarItem.text = '$(check) Polyglot';
      statusBarItem.tooltip = 'Polyglot is running';
    } else {
      statusBarItem.text = '$(warning) Polyglot';
      statusBarItem.tooltip = 'Polyglot is not reachable — click to retry';
      statusBarItem.color = new vscode.ThemeColor('problemsWarningIcon.foreground');
    }
    statusBarItem.show();
  }
}

function formatRunDetail(detail: RunDetail): string {
  const d = detail;

  let md = `# Run: ${d.orchestrationName ?? 'Unknown'}\n\n`;
  md += `**Task:** ${d.task ?? ''}\n\n`;
  md += `**Status:** ${d.status ?? ''}\n`;
  md += `**Started:** ${d.startedAt ?? ''}\n`;
  md += `**Duration:** ${d.duration ? Math.round(d.duration / 1000) + 's' : '?'}\n`;
  md += `**Nodes:** ${d.nodeCount ?? 0}\n\n`;
  md += `---\n\n`;

  if (d.logs && Array.isArray(d.logs)) {
    md += `## Run Log\n\n`;
    for (const log of d.logs) {
      md += `### ${log.label ?? 'Node'} (${log.type ?? ''})\n\n`;
      if (log.output) md += `\`\`\`\n${log.output}\n\`\`\`\n\n`;
      if (log.error) md += `**Error:** ${log.error}\n\n`;
    }
  }

  if (d.outputs && typeof d.outputs === 'object') {
    md += `## Node Outputs\n\n`;
    for (const [nodeId, output] of Object.entries(d.outputs)) {
      md += `### ${nodeId}\n\n\`\`\`\n${output}\n\`\`\`\n\n`;
    }
  }

  return md;
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
