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
exports.HistoryProvider = exports.HistoryTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const api_1 = require("../api");
class HistoryTreeItem extends vscode.TreeItem {
    run;
    constructor(run) {
        super(run.orchestrationName, vscode.TreeItemCollapsibleState.None);
        this.run = run;
        const date = new Date(run.startedAt);
        const timeStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        const durationStr = run.duration ? `${Math.round(run.duration / 1000)}s` : '?';
        this.description = `${timeStr} (${durationStr})`;
        this.tooltip = new vscode.MarkdownString(`**${run.orchestrationName}**\n\n` +
            `*Task:* ${run.task.slice(0, 200)}\n\n` +
            `*Status:* ${run.status}\n` +
            `*Nodes:* ${run.nodeCount}\n` +
            `*Duration:* ${durationStr}\n` +
            `*Started:* ${date.toLocaleString()}`);
        this.iconPath = run.status === 'completed'
            ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
            : run.status === 'failed'
                ? new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'))
                : new vscode.ThemeIcon('loading~spin');
        this.contextValue = 'runHistory';
        this.command = {
            command: 'polyglot.viewRunDetail',
            title: 'View Run Detail',
            arguments: [this],
        };
    }
}
exports.HistoryTreeItem = HistoryTreeItem;
class HistoryProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    async getTreeItem(element) {
        return element;
    }
    async getChildren() {
        try {
            const history = await (0, api_1.fetchRunHistory)();
            if (history.length === 0) {
                return [this.createMessageItem('No runs yet')];
            }
            return history.slice(0, 20).map((run) => new HistoryTreeItem(run));
        }
        catch {
            return [this.createMessageItem('Cannot connect to Polyglot')];
        }
    }
    createMessageItem(message) {
        const placeholder = {
            id: '',
            orchestrationName: message,
            orchestrationId: null,
            task: '',
            status: 'completed',
            nodeCount: 0,
            startedAt: '',
            completedAt: '',
            duration: 0,
        };
        const item = new HistoryTreeItem(placeholder);
        item.iconPath = new vscode.ThemeIcon('info');
        item.command = undefined;
        item.contextValue = 'message';
        return item;
    }
}
exports.HistoryProvider = HistoryProvider;
//# sourceMappingURL=historyProvider.js.map