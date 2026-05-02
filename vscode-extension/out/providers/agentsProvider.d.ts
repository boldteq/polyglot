import * as vscode from 'vscode';
import type { Agent } from '../types';
export declare class AgentTreeItem extends vscode.TreeItem {
    readonly agent: Agent;
    constructor(agent: Agent);
}
export declare class AgentsProvider implements vscode.TreeDataProvider<AgentTreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | AgentTreeItem | undefined>;
    private agents;
    refresh(): void;
    getTreeItem(element: AgentTreeItem): Promise<AgentTreeItem>;
    getChildren(): Promise<AgentTreeItem[]>;
    private createMessageItem;
    getAgent(name: string): Agent | undefined;
}
