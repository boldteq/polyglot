import * as vscode from 'vscode';
import { fetchOrchestrations } from '../api';
import type { Orchestration } from '../types';

export class OrchestrationTreeItem extends vscode.TreeItem {
  constructor(public readonly orchestration: Orchestration) {
    super(orchestration.name, vscode.TreeItemCollapsibleState.None);
    const nodeCount = orchestration.nodes?.length ?? 0;
    const edgeCount = orchestration.edges?.length ?? 0;
    this.description = `${nodeCount} nodes`;
    this.tooltip = new vscode.MarkdownString(
      `**${orchestration.name}**\n\n*Nodes:* ${nodeCount} | *Edges:* ${edgeCount}\n\n*ID:* \`${orchestration.id}\``
    );
    this.iconPath = new vscode.ThemeIcon('type-hierarchy');
    this.contextValue = 'orchestration';
    this.command = {
      command: 'polyglot.runOrchestration',
      title: 'Run Orchestration',
      arguments: [this],
    };
  }
}

export class OrchestrationsProvider implements vscode.TreeDataProvider<OrchestrationTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OrchestrationTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private orchestrations: Orchestration[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getTreeItem(element: OrchestrationTreeItem): Promise<OrchestrationTreeItem> {
    return element;
  }

  async getChildren(): Promise<OrchestrationTreeItem[]> {
    try {
      this.orchestrations = await fetchOrchestrations();
      if (this.orchestrations.length === 0) {
        return [this.createMessageItem('No orchestrations saved yet')];
      }
      return this.orchestrations.map((orc) => new OrchestrationTreeItem(orc));
    } catch {
      return [this.createMessageItem('Cannot connect to Polyglot')];
    }
  }

  private createMessageItem(message: string): OrchestrationTreeItem {
    const placeholder: Orchestration = {
      id: '',
      name: message,
      nodes: [],
      edges: [],
    };
    const item = new OrchestrationTreeItem(placeholder);
    item.iconPath = new vscode.ThemeIcon('warning');
    item.command = undefined;
    item.contextValue = 'message';
    return item;
  }

  getOrchestration(id: string): Orchestration | undefined {
    return this.orchestrations.find((o) => o.id === id);
  }
}
