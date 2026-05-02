import * as vscode from 'vscode';
import type { Agent } from '../types';
export declare class AgentPanel {
    static currentPanel: AgentPanel | undefined;
    private readonly panel;
    private readonly agent;
    private disposables;
    private constructor();
    static show(agent: Agent, extensionUri: vscode.Uri): void;
    private handleRun;
    private getHtml;
    private dispose;
}
