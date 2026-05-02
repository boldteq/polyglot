import * as vscode from 'vscode';
import type { Orchestration } from '../types';
export declare class OrchestrationPanel {
    static currentPanel: OrchestrationPanel | undefined;
    private readonly panel;
    private readonly orchestration;
    private disposables;
    private constructor();
    static show(orchestration: Orchestration, extensionUri: vscode.Uri): void;
    private handleRun;
    private getHtml;
    private dispose;
}
