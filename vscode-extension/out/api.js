"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAgents = fetchAgents;
exports.runAgent = runAgent;
exports.fetchOrchestrations = fetchOrchestrations;
exports.fetchOrchestration = fetchOrchestration;
exports.runOrchestration = runOrchestration;
exports.fetchRunHistory = fetchRunHistory;
exports.fetchRunDetail = fetchRunDetail;
exports.checkHealth = checkHealth;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
function getBaseUrl() {
    return vscode.workspace.getConfiguration('polyglot').get('serverUrl') || 'http://localhost:3847';
}
function request(method, path, body) {
    const baseUrl = getBaseUrl();
    const url = new url_1.URL(path, baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
// ── Agents ──
async function fetchAgents() {
    return request('GET', '/api/global/agents');
}
async function runAgent(agentName, prompt) {
    const baseUrl = getBaseUrl();
    const url = new url_1.URL('/api/playground/run', baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    return new Promise((resolve) => {
        const req = lib.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                const events = data
                    .split('\n')
                    .filter((line) => line.startsWith('data: '))
                    .map((line) => {
                    try {
                        return JSON.parse(line.slice(6));
                    }
                    catch {
                        return null;
                    }
                })
                    .filter((e) => e !== null);
                const errorEvent = events.find((e) => e.type === 'error');
                if (errorEvent) {
                    resolve({ success: false, output: '', agent: agentName, error: errorEvent.error });
                    return;
                }
                const doneEvent = events.find((e) => e.type === 'done' || e.type === 'complete');
                resolve({ success: true, output: doneEvent?.output ?? doneEvent?.finalOutput ?? '', agent: agentName });
            });
        });
        req.on('error', (err) => {
            resolve({ success: false, output: '', agent: agentName, error: err.message });
        });
        req.write(JSON.stringify({ agentName, prompt }));
        req.end();
    });
}
// ── Orchestrations ──
async function fetchOrchestrations() {
    return request('GET', '/api/orchestrations');
}
async function fetchOrchestration(id) {
    return request('GET', `/api/orchestrations/${id}`);
}
function runOrchestration(orchestration, task, onEvent, onDone, onError) {
    const baseUrl = getBaseUrl();
    const url = new url_1.URL('/api/orchestrations/run', baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const body = JSON.stringify({
        nodes: orchestration.nodes,
        edges: orchestration.edges,
        task,
        orchestrationName: orchestration.name,
        orchestrationId: orchestration.id,
    });
    const req = lib.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        },
        timeout: 600000,
    }, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        onEvent(event);
                        if (event.type === 'complete') {
                            onDone();
                        }
                    }
                    catch {
                        // skip malformed events
                    }
                }
            }
        });
        res.on('end', onDone);
    });
    req.on('error', (err) => onError(err.message));
    req.write(body);
    req.end();
}
// ── Run History ──
async function fetchRunHistory() {
    return request('GET', '/api/orchestrations/runs');
}
async function fetchRunDetail(id) {
    return request('GET', `/api/orchestrations/runs/${id}`);
}
// ── Health ──
async function checkHealth() {
    try {
        await request('GET', '/api/global/agents');
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=api.js.map