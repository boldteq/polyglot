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
exports.AgentsProvider = exports.AgentTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const api_1 = require("../api");
class AgentTreeItem extends vscode.TreeItem {
    agent;
    constructor(agent) {
        super(agent.name, vscode.TreeItemCollapsibleState.None);
        this.agent = agent;
        this.description = agent.model || '';
        this.tooltip = new vscode.MarkdownString(`**${agent.name}**\n\n${agent.description || 'No description'}\n\n*Model:* ${agent.model || 'default'}`);
        this.iconPath = new vscode.ThemeIcon('hubot');
        this.contextValue = 'agent';
        this.command = {
            command: 'polyglot.runAgent',
            title: 'Run Agent',
            arguments: [this],
        };
    }
}
exports.AgentTreeItem = AgentTreeItem;
class AgentsProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    agents = [];
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    async getTreeItem(element) {
        return element;
    }
    async getChildren() {
        try {
            this.agents = await (0, api_1.fetchAgents)();
            if (this.agents.length === 0) {
                return [this.createMessageItem('No agents found. Is Polyglot running?')];
            }
            return this.agents.map((agent) => new AgentTreeItem(agent));
        }
        catch {
            return [this.createMessageItem('Cannot connect to Polyglot')];
        }
    }
    createMessageItem(message) {
        const placeholder = {
            filename: '',
            name: message,
            description: '',
            model: '',
            body: '',
        };
        const item = new AgentTreeItem(placeholder);
        item.iconPath = new vscode.ThemeIcon('warning');
        item.command = undefined;
        item.contextValue = 'message';
        return item;
    }
    getAgent(name) {
        return this.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    }
}
exports.AgentsProvider = AgentsProvider;
//# sourceMappingURL=agentsProvider.js.map