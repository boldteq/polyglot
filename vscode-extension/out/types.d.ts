export interface Agent {
    filename: string;
    name: string;
    description: string;
    model: string;
    category?: string;
    body: string;
}
export interface OrchestrationNode {
    id: string;
    type: 'start' | 'agent' | 'custom';
    position: {
        x: number;
        y: number;
    };
    data: {
        label: string;
        agentName?: string;
        instructions?: string;
    };
}
export interface OrchestrationEdge {
    id: string;
    source: string;
    target: string;
}
export interface Orchestration {
    id: string;
    name: string;
    nodes: OrchestrationNode[];
    edges: OrchestrationEdge[];
    createdAt?: string;
}
export interface RunHistoryEntry {
    id: string;
    orchestrationName: string;
    orchestrationId: string | null;
    task: string;
    status: 'completed' | 'failed' | 'running';
    nodeCount: number;
    startedAt: string;
    completedAt: string;
    duration: number;
}
export interface RunDetail extends RunHistoryEntry {
    nodes: OrchestrationNode[];
    edges: OrchestrationEdge[];
    logs: RunLog[];
    outputs: Record<string, string>;
}
export interface RunLog {
    nodeId: string;
    label: string;
    type: 'start' | 'done' | 'error';
    output?: string;
    error?: string;
    timestamp: string;
}
export interface SSEEvent {
    type: 'start' | 'done' | 'error' | 'complete';
    nodeId?: string;
    label?: string;
    output?: string;
    error?: string;
    finalOutput?: string;
}
export interface AgentRunResult {
    success: boolean;
    output: string;
    agent: string;
    error?: string;
}
