import * as vscode from 'vscode';
import { fetchRunHistory } from '../api';
import type { RunHistoryEntry } from '../types';

export class HistoryTreeItem extends vscode.TreeItem {
  constructor(public readonly run: RunHistoryEntry) {
    super(run.orchestrationName, vscode.TreeItemCollapsibleState.None);

    const date = new Date(run.startedAt);
    const timeStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationStr = run.duration ? `${Math.round(run.duration / 1000)}s` : '?';

    this.description = `${timeStr} (${durationStr})`;
    this.tooltip = new vscode.MarkdownString(
      `**${run.orchestrationName}**\n\n` +
      `*Task:* ${run.task.slice(0, 200)}\n\n` +
      `*Status:* ${run.status}\n` +
      `*Nodes:* ${run.nodeCount}\n` +
      `*Duration:* ${durationStr}\n` +
      `*Started:* ${date.toLocaleString()}`
    );

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

export class HistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getTreeItem(element: HistoryTreeItem): Promise<HistoryTreeItem> {
    return element;
  }

  async getChildren(): Promise<HistoryTreeItem[]> {
    try {
      const history = await fetchRunHistory();
      if (history.length === 0) {
        return [this.createMessageItem('No runs yet')];
      }
      return history.slice(0, 20).map((run) => new HistoryTreeItem(run));
    } catch {
      return [this.createMessageItem('Cannot connect to Polyglot')];
    }
  }

  private createMessageItem(message: string): HistoryTreeItem {
    const placeholder: RunHistoryEntry = {
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
