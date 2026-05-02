import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import type {
  Agent,
  Orchestration,
  RunHistoryEntry,
  RunDetail,
  SSEEvent,
  AgentRunResult,
} from './types';

function getBaseUrl(): string {
  return vscode.workspace.getConfiguration('polyglot').get<string>('serverUrl') || 'http://localhost:3847';
}

function request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = new URL(path, baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', (err: Error) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ── Agents ──

export async function fetchAgents(): Promise<Agent[]> {
  return request<Agent[]>('GET', '/api/global/agents');
}

export async function runAgent(agentName: string, prompt: string): Promise<AgentRunResult> {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/playground/run', baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          const events = data
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => {
              try { return JSON.parse(line.slice(6)) as SSEEvent; }
              catch { return null; }
            })
            .filter((e): e is SSEEvent => e !== null);

          const errorEvent = events.find((e) => e.type === 'error');
          if (errorEvent) {
            resolve({ success: false, output: '', agent: agentName, error: errorEvent.error });
            return;
          }

          const doneEvent = events.find((e) => e.type === 'done' || e.type === 'complete');
          resolve({ success: true, output: doneEvent?.output ?? doneEvent?.finalOutput ?? '', agent: agentName });
        });
      }
    );

    req.on('error', (err: Error) => {
      resolve({ success: false, output: '', agent: agentName, error: err.message });
    });

    req.write(JSON.stringify({ agentName, prompt }));
    req.end();
  });
}

// ── Orchestrations ──

export async function fetchOrchestrations(): Promise<Orchestration[]> {
  return request<Orchestration[]>('GET', '/api/orchestrations');
}

export async function fetchOrchestration(id: string): Promise<Orchestration> {
  return request<Orchestration>('GET', `/api/orchestrations/${id}`);
}

export function runOrchestration(
  orchestration: Orchestration,
  task: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
  onError: (err: string) => void
): void {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/orchestrations/run', baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const body = JSON.stringify({
    nodes: orchestration.nodes,
    edges: orchestration.edges,
    task,
    orchestrationName: orchestration.name,
    orchestrationId: orchestration.id,
  });

  const req = lib.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      timeout: 600000,
    },
    (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;
              onEvent(event);
              if (event.type === 'complete') {
                onDone();
              }
            } catch {
              // skip malformed events
            }
          }
        }
      });
      res.on('end', onDone);
    }
  );

  req.on('error', (err: Error) => onError(err.message));
  req.write(body);
  req.end();
}

// ── Run History ──

export async function fetchRunHistory(): Promise<RunHistoryEntry[]> {
  return request<RunHistoryEntry[]>('GET', '/api/orchestrations/runs');
}

export async function fetchRunDetail(id: string): Promise<RunDetail> {
  return request<RunDetail>('GET', `/api/orchestrations/runs/${id}`);
}

// ── Health ──

export async function checkHealth(): Promise<boolean> {
  try {
    await request<Agent[]>('GET', '/api/global/agents');
    return true;
  } catch {
    return false;
  }
}
