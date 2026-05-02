import * as vscode from 'vscode';
import { fetchAgents } from '../api';
import type { Agent } from '../types';

export class AgentTreeItem extends vscode.TreeItem {
  constructor(public readonly agent: Agent) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    this.description = agent.model || '';
    this.tooltip = new vscode.MarkdownString(
      `**${agent.name}**\n\n${agent.description || 'No description'}\n\n*Model:* ${agent.model || 'default'}`
    );
    this.iconPath = new vscode.ThemeIcon('hubot');
    this.contextValue = 'agent';
    this.command = {
      command: 'polyglot.runAgent',
      title: 'Run Agent',
      arguments: [this],
    };
  }
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private agents: Agent[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getTreeItem(element: AgentTreeItem): Promise<AgentTreeItem> {
    return element;
  }

  async getChildren(): Promise<AgentTreeItem[]> {
    try {
      this.agents = await fetchAgents();
      if (this.agents.length === 0) {
        return [this.createMessageItem('No agents found. Is Polyglot running?')];
      }
      return this.agents.map((agent) => new AgentTreeItem(agent));
    } catch {
      return [this.createMessageItem('Cannot connect to Polyglot')];
    }
  }

  private createMessageItem(message: string): AgentTreeItem {
    const placeholder: Agent = {
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

  getAgent(name: string): Agent | undefined {
    return this.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
  }
}
