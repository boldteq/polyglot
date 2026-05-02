import type { Agent, Orchestration, RunHistoryEntry, RunDetail, SSEEvent, AgentRunResult } from './types';
export declare function fetchAgents(): Promise<Agent[]>;
export declare function runAgent(agentName: string, prompt: string): Promise<AgentRunResult>;
export declare function fetchOrchestrations(): Promise<Orchestration[]>;
export declare function fetchOrchestration(id: string): Promise<Orchestration>;
export declare function runOrchestration(orchestration: Orchestration, task: string, onEvent: (event: SSEEvent) => void, onDone: () => void, onError: (err: string) => void): void;
export declare function fetchRunHistory(): Promise<RunHistoryEntry[]>;
export declare function fetchRunDetail(id: string): Promise<RunDetail>;
export declare function checkHealth(): Promise<boolean>;
