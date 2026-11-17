import { apiJson } from "@/lib/apiClient";

const endpoint = `${(process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/admin/agent-hq`;

export interface Metrics {
  recorded: number;
  completed: number;
  failed: number;
  active: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
  estimated_tokens: number | null;
  estimated_cost_usd: number | null;
  success_rate: number | null;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  team: string;
  manager_id: string | null;
  description: string;
  capabilities: string[];
  status: string;
  metrics: Metrics;
  last_activity: string | null;
  current_task: string | null;
  style: string;
  tools: string[];
  kind: string;
  version?: string;
}

export interface Activity {
  id: string;
  agent_id: string;
  operation: string;
  status: string;
  created_at: string;
  latency_ms: number | null;
  run_id?: string | null;
  source: string;
}

export type Decision = "accepted" | "deferred" | "dismissed";

export interface Recommendation {
  id: string;
  agent_id: string;
  title: string;
  summary: string;
  evidence: string[];
  proposed_action: string;
  status?: "pending" | Decision;
  confidence?: string;
  risks?: string;
}

export interface Handoff {
  id: string;
  operation: string;
  from_agent: string;
  to_agent: string;
  status: string;
  created_at: string;
}

export interface ModelUsage {
  provider: string | null;
  model: string | null;
  calls: number;
  failures: number;
  avg_latency_ms: number | null;
  estimated_tokens: number | null;
  estimated_cost_usd: number | null;
}

export interface TraceDetail {
  activity: Activity;
  related_activity: Activity[];
  handoffs: Handoff[];
  models: ModelUsage[];
}

export interface Snapshot {
  generated_at: string;
  days: number;
  agents: Agent[];
  metrics: Metrics;
  activity: Activity[];
  recommendations: Recommendation[];
  active_runs?: Run[];
  handoffs?: Handoff[];
  models?: ModelUsage[];
  incidents?: Activity[];
  trends?: Array<{date: string; recorded: number; completed: number; failed: number}>;
  coverage: {
    sources: string[];
    first_observation: string | null;
    last_observation: string | null;
    latency_sample_size: number;
    latency_sample_limit: number;
    unavailable: string[];
    notes?: string[];
    stale: boolean;
  };
  executives: Array<{name: string; role: string}>;
}

export type RunKind = "direct" | "meeting" | "standup" | "report";

export interface Run {
  id: string;
  kind: RunKind;
  topic: string;
  participant_ids: string[];
  days: number;
  status: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  result: unknown;
  parent_run_id?: string | null;
  ending_on?: string | null;
  messages?: Array<{id: string | number; agent_id: string | null; kind: string; text: string; evidence: unknown; created_at: string}>;
}

export interface RunInput {
  request_id: string;
  kind: RunKind;
  topic: string;
  participant_ids: string[];
  days: number;
  parent_run_id?: string;
  ending_on?: string;
}

export interface Schedule {
  enabled: boolean;
  timezone: string;
  hour: number;
  minute: number;
  next_run_at?: string | null;
}

export type GetAuthHeaders = () => Promise<HeadersInit>;

export function createAgentHqClient(getHeaders: GetAuthHeaders) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(await getHeaders());
    if (options.body) headers.set("Content-Type", "application/json");
    return apiJson<T>(endpoint + path, { ...options, headers, timeoutMs: 30_000, forceFresh: true, invalidateOnSuccess: false });
  }
  return {
    snapshot: (days: number, signal?: AbortSignal) => request<Snapshot>(`/snapshot?days=${days}`, { signal }),
    runs: (before?: string, signal?: AbortSignal, search?: string) => request<{runs: Run[]; next_cursor: string | null}>(
      `/runs?limit=30${before ? `&before=${encodeURIComponent(before)}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { signal }),
    run: (id: string, signal?: AbortSignal) => request<Run>(`/runs/${encodeURIComponent(id)}`, { signal }),
    create: (input: RunInput) => request<Run>("/runs", { method: "POST", body: JSON.stringify(input) }),
    trace: (id: string, signal?: AbortSignal) => request<TraceDetail>(`/traces/${encodeURIComponent(id)}`, { signal }),
    decide: (id: string, status: Decision, days: number) => request<{id: string; status: Decision}>(
      `/recommendations/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ status, days }) }),
    schedule: (signal?: AbortSignal) => request<Schedule>("/schedule", { signal }),
    updateSchedule: (schedule: Omit<Schedule, "next_run_at">) => request<Schedule>("/schedule", {
      method: "PUT", body: JSON.stringify(schedule),
    }),
    async events(signal: AbortSignal, onOpen: () => void, onUpdate: (version: string) => void) {
      const headers = new Headers(await getHeaders());
      headers.set("Accept", "text/event-stream");
      const response = await fetch(endpoint + "/events", { headers, cache: "no-store", signal });
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error(`Live connection unavailable (${response.status}).`);
      }
      onOpen();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffered = "";
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffered += value;
          if (buffered.length > 65_536) throw new Error("Unexpected live response size.");
          const frames = buffered.split(/\r?\n\r?\n/);
          buffered = frames.pop() || "";
          for (const frame of frames) {
            const lines = frame.split(/\r?\n/);
            if (!lines.some(line => /^event:\s*update\s*$/.test(line))) continue;
            const data = lines.find(line => line.startsWith("data:"))?.slice(5).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data) as {version?: unknown};
              if (typeof parsed.version === "string" || typeof parsed.version === "number") onUpdate(String(parsed.version));
            } catch { /* A malformed event never invalidates verified snapshots. */ }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}

function csvCell(value: unknown) {
  const raw = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const text = /^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(raw) ? "'" + raw : raw;
  return '"' + text.replaceAll('"', '""') + '"';
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function serializeReportCsv(run: Run) {
  const report = fields(run.result);
  const metricKeys = ["recorded","completed","failed","active","p95_latency_ms","estimated_tokens","estimated_cost_usd"];
  const context = [run.id, run.kind, run.topic, report.starts_at, report.ends_at];
  const headings = ["run_id","kind","topic","period_start_utc","period_end_utc","agent_id","agent",...metricKeys,"finding"];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const rows = findings.map(value => {
    const finding = fields(value);
    const metrics = fields(finding.metrics);
    return [...context,finding.agent_id,finding.name,...metricKeys.map(key => metrics[key]),finding.text];
  });
  return [headings,...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportReport(run: Run, format: "json" | "csv" = "json") {
  const content = format === "csv" ? serializeReportCsv(run) : JSON.stringify(run, null, 2);
  const blob = new Blob([content], {type: format === "csv" ? "text/csv;charset=utf-8" : "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agent-hq-${run.kind}-${run.id}.${format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
