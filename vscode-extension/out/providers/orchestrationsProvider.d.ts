import * as vscode from 'vscode';
import type { Orchestration } from '../types';
export declare class OrchestrationTreeItem extends vscode.TreeItem {
    readonly orchestration: Orchestration;
    constructor(orchestration: Orchestration);
}
export declare class OrchestrationsProvider implements vscode.TreeDataProvider<OrchestrationTreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | OrchestrationTreeItem | undefined>;
    private orchestrations;
    refresh(): void;
    getTreeItem(element: OrchestrationTreeItem): Promise<OrchestrationTreeItem>;
    getChildren(): Promise<OrchestrationTreeItem[]>;
    private createMessageItem;
    getOrchestration(id: string): Orchestration | undefined;
}
