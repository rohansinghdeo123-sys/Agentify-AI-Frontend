import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/Polished";
import type { Activity, Agent, Decision, Handoff, ModelUsage, Recommendation, Run, Snapshot, TraceDetail } from "./api";
import styles from "./agentHq.module.css";

const portraitIds = ["orchestrator", "coach", "tutor", "revision", "exam", "planner", "lead_coach_orchestrator", "intent_profiler", "response_planner", "context_retriever", "answer_reviewer", "quality_verifier"];
const workflowPortraitIds = ["tool_gateway", "tutor_model", "memory_mastery_engine", "conversation_responder"];
const numbers = new Intl.NumberFormat("en-IN");
const periodLabel = (days: number) => days === 1 ? "Past 24 hours" : `Past ${days} days`;
const timestamps = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
export const count = (value?: number | null) => value == null ? "—" : numbers.format(value);
export const latency = (value?: number | null) => value == null ? "—" : `${count(Math.round(value))} ms`;
export function time(value?: string | null) {
  if (!value) return "No timestamp";
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? "No timestamp" : timestamps.format(date);
}

export function Status({ value }: { value: string }) {
  const tone = /working|running|collaborating/.test(value) ? "working"
    : /success|completed|available|accepted|connected/i.test(value) ? "healthy"
    : /failed|error/.test(value) ? "error"
    : /waiting|queued|degraded|partial/.test(value) ? "warning" : "neutral";
  return <span className={styles.status} data-tone={tone}>{value === "unknown" ? "Status unknown" : title(value)}</span>;
}

export function Portrait({ agent, small = false, motion }: {agent: Agent; small?: boolean; motion?: "working" | "speaking"}) {
  const initials = agent.name.split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  const index = portraitIds.indexOf(agent.id);
  const workflow = workflowPortraitIds.indexOf(agent.id);
  return <span className={`${styles.portrait} ${small ? styles.portraitSmall : ""}`} data-motion={motion ?? (agent.status === "working" ? "working" : undefined)} aria-hidden="true">
    {index >= 0 ? <span className={styles.portraitAsset} style={{backgroundPosition: `${(index % 4) / 3 * 100}% ${Math.floor(index / 4) / 2 * 100}%`}} /> : workflow >= 0 ? <span className={`${styles.portraitAsset} ${styles.workflowPortrait}`} style={{backgroundPosition:`${workflow % 2 * 100}% ${Math.floor(workflow / 2) * 100}%`}} /> : <abbr>{initials}</abbr>}
    {motion === "speaking" && <span className={styles.waveform}><i /><i /><i /><i /></span>}
  </span>;
}

export function Heading({ children, detail }: { children: ReactNode; detail: string }) {
  return <header className={styles.heading}><h1>{children}</h1><p>{detail}</p></header>;
}

export function Roster({ agents, onSelect, selected, onTalk, onReport }: {
  agents: Agent[]; onSelect: (id: string) => void; selected?: string;
  onTalk?: (agent: Agent) => void; onReport?: (agent: Agent) => void;
}) {
  if (!agents.length) return <p className={styles.empty}>No registered roles in this team.</p>;
  return <div className={styles.roster}>{agents.map(agent => (
    <article className={styles.agentCard} key={agent.id}>
    <button className={styles.agent} type="button" onClick={() => onSelect(agent.id)} data-selected={selected === agent.id}
      aria-label={`View ${agent.name}, ${agent.role}`}>
      <Portrait agent={agent} />
      <span className={styles.agentText}>
        <strong>{agent.name}</strong><small>{agent.role}</small><Status value={agent.status} />
      </span>
    </button>
    {(onTalk || onReport) && <div className={styles.agentActions}>
      {onTalk && <button type="button" className={styles.button} onClick={() => onTalk(agent)} aria-label={`Chat with ${agent.name}`}>Chat</button>}
      {onReport && <button type="button" className={styles.button} onClick={() => onReport(agent)} aria-label={`Report for ${agent.name}`}>Report</button>}
    </div>}
    </article>
  ))}</div>;
}

function MetricStrip({ entries }: { entries: Array<[string, string, string?]> }) {
  return <div className={styles.metrics}>{entries.map(([label, value, detail]) => (
    <div className={styles.metric} key={label}><p>{label}</p><strong>{value}</strong>{detail && <p>{detail}</p>}</div>
  ))}</div>;
}

export function ActivityList({ activity, agents, showTrace }: {
  activity: Activity[]; agents: Agent[]; showTrace?: (id: string) => void;
}) {
  if (!activity.length) return <p className={styles.empty}>No recorded activity for this period.</p>;
  return <ul className={styles.rows}>{activity.map(item => (
    <li key={item.id} className={styles.row}>
      <div>
        <strong>{title(item.operation)}</strong>
        <p>{agents.find(agent => agent.id === item.agent_id)?.name || title(item.agent_id)} · {time(item.created_at)}</p>
        <p>{title(item.source)}{item.latency_ms == null ? "" : ` · ${latency(item.latency_ms)}`}</p>
      </div>
      <div><Status value={item.status} />{showTrace && <button type="button" className={styles.button} onClick={() => showTrace(item.id)}>Trace</button>}</div>
    </li>
  ))}</ul>;
}

export function Recommendations({ items, agents, busy, onDecision }: {
  items: Recommendation[]; agents: Agent[]; busy: string | null; onDecision: (id: string, decision: Decision) => void;
}) {
  if (!items.length) return <p className={styles.empty}>No evidence-backed recommendations in this period.</p>;
  return <ul className={styles.rows}>{items.map(item => (
    <li key={item.id} className={styles.row}>
      <div>
        <h3>{item.title}</h3>
        <p>{agents.find(agent => agent.id === item.agent_id)?.name || title(item.agent_id)}</p>
        <p>{item.summary}</p>
        <details className={styles.details}>
          <summary>Evidence and proposed action</summary>
          <p>{item.proposed_action}</p>
          {item.evidence.map((line, index) => <p key={index}>{line}</p>)}
          {item.confidence && <p>{item.confidence}</p>}
          {item.risks && <p>{item.risks}</p>}
        </details>
        <div className={`${styles.actions} mt-2`}>
          {(["accepted", "deferred", "dismissed"] as const).map((value, index) => (
            <button type="button" key={value} className={styles.button} disabled={busy !== null || item.status === value} onClick={() => onDecision(item.id, value)}>
              {["Accept", "Defer", "Dismiss"][index]}
            </button>
          ))}
        </div>
      </div><Status value={item.status || "pending"} />
    </li>
  ))}</ul>;
}

export function CommandCenter({ snapshot, connected, openOrganization, openStandup, onTalk, onReport, showRun, showTrace, briefing, busy, onDecision }: {
  snapshot: Snapshot; connected: boolean; openOrganization: (id?: string) => void; openStandup: () => void;
  onTalk: (agent: Agent) => void; onReport: (agent: Agent) => void;
  showRun: (id: string) => void; showTrace: (id: string) => void; briefing?: Run; busy: string | null; onDecision: (id: string, decision: Decision) => void;
}) {
  const {agents, metrics, recommendations, activity} = snapshot;
  return <>
    <header className={styles.hero}>
      <div>
        <p className={styles.overline}>AgentifyAI Agent HQ</p>
        <h1>Workforce Command Center</h1>
        <p>Review agent activity, convene the team, and make decisions from recorded evidence.</p>
        <div className={`${styles.actions} mt-4`}><button type="button" className={`${styles.button} ${styles.primary}`} onClick={openStandup}><AppIcon name="study" /> Run a standup</button></div>
      </div>
      <div className={styles.readout}>
        <Status value={connected ? "Connected" : "Refresh mode"} />
        <strong>{agents.length} registered roles</strong>
        <p>Snapshot as of {time(snapshot.generated_at)} IST</p>
      </div>
    </header>
    <section aria-labelledby="hq-roster">
      <div className={styles.blockHead}><div><h2 id="hq-roster">Meet your agents</h2><p>Start a conversation, open a profile, or request an activity report.</p></div>
        <button type="button" className={styles.button} onClick={() => openOrganization()}>Organization <AppIcon name="arrowRight" /></button>
      </div>
      <Roster agents={agents.filter(agent => portraitIds.slice(0, 6).includes(agent.id)).length ? agents.filter(agent => portraitIds.slice(0, 6).includes(agent.id)) : agents.slice(0, 6)} onSelect={openOrganization} onTalk={onTalk} onReport={onReport} />
    </section>
    <MetricStrip entries={[
      ["Recorded work", count(metrics.recorded), periodLabel(snapshot.days)], ["In progress", count(metrics.active), "Recorded active operations"],
      ["Completed / failed", `${count(metrics.completed)} / ${count(metrics.failed)}`, "Recorded outcomes"], ["Measured p95", latency(metrics.p95_latency_ms), `${count(snapshot.coverage.latency_sample_size)} measured samples`],
    ]} />
    <div className={styles.split}>
      <section className={styles.panel}><h2>Executive briefing</h2>
        {briefing ? <><p>{briefing.topic} · {time(briefing.created_at)} IST</p><p>{runSummary(briefing)}</p>
          <button type="button" className={`${styles.button} mt-3`} onClick={() => showRun(briefing.id)}>Open briefing</button></> : <p className={styles.empty}>No standups recorded yet.</p>}
      </section>
      <section className={styles.panel}><h2>Active HQ requests</h2>
        {!snapshot.active_runs?.length && <p className={styles.empty}>No recorded HQ work in progress.</p>}
        <ul className={styles.rows}>{snapshot.active_runs?.map(item => <li key={item.id} className={styles.row}>
          <div><strong>{item.topic}</strong><p><Status value={item.status} /></p></div>
          <button type="button" className={styles.button} onClick={() => showRun(item.id)}>Open</button>
        </li>)}</ul>
      </section>
    </div>
    <div className={styles.split}>
      <section className={styles.panel}><h2>Recent activity</h2><ActivityList activity={activity.slice(0, 5)} agents={agents} showTrace={showTrace} /></section>
      <section className={styles.panel}><h2>Executive decisions</h2><Recommendations items={recommendations.slice(0, 4)} agents={agents} busy={busy} onDecision={onDecision} /></section>
    </div>
  </>;
}

export function Organization({ snapshot, selected, onSelect, onTalk, onReport }: {
  snapshot: Snapshot; selected: string; onSelect: (id: string) => void; onTalk: (agent: Agent) => void; onReport: (agent: Agent) => void;
}) {
  const current = snapshot.agents.find(agent => agent.id === selected) || snapshot.agents[0];
  const teams = [...new Set(snapshot.agents.map(agent => agent.team))];
  return <>
    <Heading detail="Explore the registered AI roles and their reporting relationships.">AI Organization</Heading>
    <div className={styles.org}>
      <div className={styles.panel}>
        <h2 className="mb-3">Executive leadership</h2>
        <div className={styles.people}>{snapshot.executives.map(executive => <div key={executive.name}><strong>{executive.name}</strong><span>{executive.role}</span></div>)}</div>
        {teams.map(team => <details key={team} className={styles.team} open>
          <summary>{team}</summary><Roster agents={snapshot.agents.filter(agent => agent.team === team)} onSelect={onSelect} selected={current?.id} />
        </details>)}
      </div>
      {current && <section className={`${styles.panel} ${styles.dossier}`} aria-label="Agent profile">
        <Portrait agent={current} /><h2>{current.name}</h2><p>{current.role} · {current.team}</p><Status value={current.status} />
        <p className={styles.muted}>{current.description}</p>
        <dl className={styles.factList}>
          <div><dt>Reports to</dt><dd>{snapshot.agents.find(agent => agent.id === current.manager_id)?.name || "Co-CEOs"}</dd></div>
          <div><dt>Role type</dt><dd>{title(current.kind || "agent")}</dd></div>
          {current.version && <div><dt>Runtime version</dt><dd>{current.version}</dd></div>}
          <div><dt>Communication style</dt><dd>{current.style || "Unavailable"}</dd></div>
          <div><dt>Capabilities</dt><dd>{current.capabilities.join(" · ") || "Unavailable"}</dd></div>
          <div><dt>Tools</dt><dd>{current.tools?.join(" · ") || "No HQ tools registered"}</dd></div>
          <div><dt>Current assignment</dt><dd>{current.current_task || "No recorded assignment"}</dd></div>
          <div><dt>Last observation</dt><dd>{time(current.last_activity)}</dd></div>
        </dl>
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => onTalk(current)}><AppIcon name="study" /> Ask agent</button>
          <button type="button" className={styles.button} onClick={() => onReport(current)}>Request report</button>
        </div>
      </section>}
    </div>
  </>;
}

export function MetricsTable({ agents }: {agents: Agent[]}) {
  return <div className={styles.scroll}><table className={styles.table}>
    <thead><tr><th scope="col">Agent</th><th scope="col">Recorded</th><th scope="col">Completed</th><th scope="col">Failed</th><th scope="col">P95</th><th scope="col">Est. tokens</th></tr></thead>
    <tbody>{agents.map(agent => <tr key={agent.id}><th scope="row">{agent.name}</th><td>{count(agent.metrics.recorded)}</td><td>{count(agent.metrics.completed)}</td><td>{count(agent.metrics.failed)}</td><td>{latency(agent.metrics.p95_latency_ms)}</td><td>{count(agent.metrics.estimated_tokens)}</td></tr>)}</tbody>
  </table></div>;
}

export function Observability({ snapshot, showTrace, trace, busy, onDecision }: {
  snapshot: Snapshot; showTrace: (id: string) => void; trace: TraceDetail | null; busy: string | null; onDecision: (id: string, decision: Decision) => void;
}) {
  const {metrics, coverage} = snapshot;
  return <>
    <Heading detail={`Recorded runtime and Agent HQ evidence · ${periodLabel(snapshot.days)}`}>Performance &amp; Observability</Heading>
    <MetricStrip entries={[
      ["p50 latency", latency(metrics.p50_latency_ms)], ["p95 latency", latency(metrics.p95_latency_ms)], ["p99 latency", latency(metrics.p99_latency_ms)],
      ["Estimated cost", metrics.estimated_cost_usd == null ? "—" : `$${metrics.estimated_cost_usd.toFixed(4)}`, "USD · where reported"],
    ]} />
    <section className={styles.panel}><h2>Agent performance</h2><MetricsTable agents={snapshot.agents} /></section>
    <Trend rows={snapshot.trends || []} />
    <div className={styles.split}>
      <section className={styles.panel}><h2>Evidence coverage</h2>
        <dl className={styles.factList}>
          <div><dt>Sources</dt><dd>{coverage.sources.join(" · ") || "No recorded sources"}</dd></div>
          <div><dt>Last observation</dt><dd>{time(coverage.last_observation)}</dd></div>
          <div><dt>Latency samples</dt><dd>{count(coverage.latency_sample_size)} of up to {count(coverage.latency_sample_limit)}</dd></div>
          <div><dt>Unavailable metrics</dt><dd>{coverage.unavailable.map(title).join(" · ") || "None within scope"}</dd></div>
        </dl>
        {coverage.stale && <p className={styles.notice}>Some activity is stale or absent in the current window.</p>}
        {coverage.notes?.map(note => <p key={note} className={styles.subtle}>{note}</p>)}
      </section>
      <section className={styles.panel}><h2>Recommendations</h2><Recommendations items={snapshot.recommendations} agents={snapshot.agents} busy={busy} onDecision={onDecision} /></section>
    </div>
    {trace && <section id="agent-hq-trace" className={`${styles.panel} mt-4`} tabIndex={-1} aria-label="Trace detail">
      <h2>Trace detail</h2>
      <p className={styles.muted}>{trace.activity.id} · {title(trace.activity.operation)}</p>
      <ActivityList activity={trace.related_activity.length ? trace.related_activity : [trace.activity]} agents={snapshot.agents} />
      <Handoffs items={trace.handoffs} agents={snapshot.agents} />
      <UsageTable rows={trace.models} />
    </section>}
    <section className={`${styles.panel} mt-4`}><h2>Model usage</h2><UsageTable rows={snapshot.models || []} /></section>
    <section className={`${styles.panel} mt-4`}><h2>Activity and incidents</h2><ActivityList activity={snapshot.activity} agents={snapshot.agents} showTrace={showTrace} /></section>
  </>;
}

export function runSummary(run: Run) {
  const result = run.result;
  return result && typeof result === "object" && "summary" in result && typeof result.summary === "string" ? result.summary : "";
}

export function Handoffs({ items, agents }: {items: Handoff[]; agents: Agent[]}) {
  const names = new Map(agents.map(agent => [agent.id,agent.name]));
  if (!items.length) return <p className={styles.empty}>No recorded collaboration in this period.</p>;
  return <ul className={styles.rows}>{items.slice(0, 15).map(item => <li key={item.id} className={styles.row}>
    <div><strong>{names.get(item.from_agent) || title(item.from_agent)} → {names.get(item.to_agent) || title(item.to_agent)}</strong><p>{item.operation} · {time(item.created_at)} IST</p></div>
    <Status value={item.status} />
  </li>)}</ul>;
}

function UsageTable({ rows }: {rows: ModelUsage[]}) {
  if (!rows.length) return <p className={styles.empty}>No model usage was recorded for this selection.</p>;
  return <div className={styles.scroll}><table className={styles.table}><thead><tr>
    <th scope="col">Model</th><th scope="col">Calls</th><th scope="col">Failures</th><th scope="col">Average</th><th scope="col">Est. tokens</th>
  </tr></thead><tbody>{rows.map(row => <tr key={`${row.provider}:${row.model}`}>
    <th scope="row">{row.model || "Unspecified"}{row.provider && ` · ${row.provider}`}</th>
    <td>{count(row.calls)}</td><td>{count(row.failures)}</td><td>{latency(row.avg_latency_ms)}</td><td>{count(row.estimated_tokens)}</td>
  </tr>)}</tbody></table></div>;
}

function Trend({ rows }: {rows: NonNullable<Snapshot["trends"]>}) {
  const recent = rows.slice(-14);
  if (!recent.length) return null;
  const peak = Math.max(...recent.map(row => row.recorded), 1);
  return <section className={`${styles.panel} mt-4`}>
    <h2>Recorded activity by day</h2>
    <p className={styles.subtle}>Most recent observed dates · UTC</p>
    <ul className={styles.trend}>{recent.map(row => <li key={row.date}>
      <span>{row.date.slice(5)}</span>
      <span className={styles.trendTrack} aria-hidden="true"><span style={{width:`${row.recorded / peak * 100}%`}} /></span>
      <span>{count(row.recorded)} recorded · {count(row.failed)} failed</span>
    </li>)}</ul>
  </section>;
}
