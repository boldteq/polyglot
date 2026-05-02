import * as vscode from 'vscode';
import type { RunHistoryEntry } from '../types';
export declare class HistoryTreeItem extends vscode.TreeItem {
    readonly run: RunHistoryEntry;
    constructor(run: RunHistoryEntry);
}
export declare class HistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | HistoryTreeItem | undefined>;
    refresh(): void;
    getTreeItem(element: HistoryTreeItem): Promise<HistoryTreeItem>;
    getChildren(): Promise<HistoryTreeItem[]>;
    private createMessageItem;
}
