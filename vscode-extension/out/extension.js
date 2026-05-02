"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const agentsProvider_1 = require("./providers/agentsProvider");
const orchestrationsProvider_1 = require("./providers/orchestrationsProvider");
const historyProvider_1 = require("./providers/historyProvider");
const agentPanel_1 = require("./panels/agentPanel");
const orchestrationPanel_1 = require("./panels/orchestrationPanel");
const api_1 = require("./api");
let statusBarItem;
async function activate(context) {
    // ── Status bar ──
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    statusBarItem.command = 'polyglot.checkStatus';
    context.subscriptions.push(statusBarItem);
    // ── Tree providers ──
    const agentsProvider = new agentsProvider_1.AgentsProvider();
    const orchestrationsProvider = new orchestrationsProvider_1.OrchestrationsProvider();
    const historyProvider = new historyProvider_1.HistoryProvider();
    vscode.window.registerTreeDataProvider('polyglot.agents', agentsProvider);
    vscode.window.registerTreeDataProvider('polyglot.orchestrations', orchestrationsProvider);
    vscode.window.registerTreeDataProvider('polyglot.history', historyProvider);
    // ── Commands ──
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.refreshAgents', () => {
        agentsProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.refreshOrchestrations', () => {
        orchestrationsProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.refreshHistory', () => {
        historyProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.runAgent', async (item) => {
        let agent = item?.agent;
        if (!agent) {
            // Quick pick if not called from tree
            try {
                const agents = await (0, api_1.fetchAgents)();
                const picked = await vscode.window.showQuickPick(agents.map((a) => ({
                    label: a.name,
                    description: a.model || '',
                    detail: a.description || '',
                    agent: a,
                })), { placeHolder: 'Select an agent to run' });
                if (!picked)
                    return;
                agent = picked.agent;
            }
            catch {
                void vscode.window.showErrorMessage('Cannot connect to Polyglot. Is it running?');
                return;
            }
        }
        if (!agent || !agent.filename)
            return;
        agentPanel_1.AgentPanel.show(agent, context.extensionUri);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.runOrchestration', async (item) => {
        let orchestration = item?.orchestration;
        if (!orchestration) {
            const { fetchOrchestrations } = await Promise.resolve().then(() => __importStar(require('./api')));
            try {
                const orcs = await fetchOrchestrations();
                if (orcs.length === 0) {
                    void vscode.window.showInformationMessage('No orchestrations saved. Create one in Polyglot first.');
                    return;
                }
                const picked = await vscode.window.showQuickPick(orcs.map((o) => ({
                    label: o.name,
                    description: `${o.nodes.length} nodes`,
                    detail: `ID: ${o.id}`,
                    orchestration: o,
                })), { placeHolder: 'Select a pipeline to run' });
                if (!picked)
                    return;
                orchestration = picked.orchestration;
            }
            catch {
                void vscode.window.showErrorMessage('Cannot connect to Polyglot. Is it running?');
                return;
            }
        }
        if (!orchestration || !orchestration.id)
            return;
        orchestrationPanel_1.OrchestrationPanel.show(orchestration, context.extensionUri);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.viewRunDetail', async (item) => {
        if (!item?.run?.id)
            return;
        try {
            const detail = await (0, api_1.fetchRunDetail)(item.run.id);
            const doc = await vscode.workspace.openTextDocument({
                content: formatRunDetail(detail),
                language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }
        catch {
            void vscode.window.showErrorMessage('Failed to load run details');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.openHub', () => {
        const url = vscode.workspace.getConfiguration('polyglot').get('serverUrl') || 'http://localhost:3847';
        void vscode.env.openExternal(vscode.Uri.parse(url));
    }));
    context.subscriptions.push(vscode.commands.registerCommand('polyglot.checkStatus', async () => {
        const online = await (0, api_1.checkHealth)();
        if (online) {
            statusBarItem.text = '$(check) Polyglot';
            statusBarItem.tooltip = 'Polyglot is running';
            statusBarItem.color = undefined;
            void vscode.window.showInformationMessage('Polyglot is online and connected.');
        }
        else {
            statusBarItem.text = '$(error) Polyglot';
            statusBarItem.tooltip = 'Polyglot is not reachable';
            statusBarItem.color = new vscode.ThemeColor('errorForeground');
            void vscode.window.showWarningMessage('Polyglot is not reachable. Check if the server is running.');
        }
    }));
    // ── Auto-connect on startup ──
    const autoConnect = vscode.workspace.getConfiguration('polyglot').get('autoConnect');
    if (autoConnect) {
        const online = await (0, api_1.checkHealth)();
        if (online) {
            statusBarItem.text = '$(check) Polyglot';
            statusBarItem.tooltip = 'Polyglot is running';
        }
        else {
            statusBarItem.text = '$(warning) Polyglot';
            statusBarItem.tooltip = 'Polyglot is not reachable — click to retry';
            statusBarItem.color = new vscode.ThemeColor('problemsWarningIcon.foreground');
        }
        statusBarItem.show();
    }
}
function formatRunDetail(detail) {
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
            if (log.output)
                md += `\`\`\`\n${log.output}\n\`\`\`\n\n`;
            if (log.error)
                md += `**Error:** ${log.error}\n\n`;
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
function deactivate() {
    statusBarItem?.dispose();
}
//# sourceMappingURL=extension.js.map