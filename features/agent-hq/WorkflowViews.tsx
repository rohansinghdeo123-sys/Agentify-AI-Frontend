import type { FormEvent, ReactNode } from "react";
import { AppIcon } from "@/components/ui/Polished";
import { exportReport, type Agent, type Run, type RunKind, type Schedule, type Snapshot } from "./api";
import { Heading, MetricsTable, Portrait, Status, runSummary, time, title } from "./OverviewViews";
import styles from "./agentHq.module.css";

export function RunHistory({ runs, selected, onSelect, onMore, more, loading }: {
  runs: Run[]; selected: string | null; onSelect: (id: string) => void; onMore: () => void; more: boolean; loading: boolean;
}) {
  return <>
    <div className={styles.history}>{runs.map(run => (
      <button key={run.id} type="button" aria-pressed={selected === run.id} onClick={() => onSelect(run.id)}>
        <strong>{run.topic}</strong><br /><small className={styles.muted}>{title(run.kind)} · {time(run.created_at)}</small>
      </button>
    ))}</div>
    {runs.length === 0 && <p className={styles.empty}>No saved work in this view yet.</p>}
    {more && <button type="button" className={styles.button} onClick={onMore} disabled={loading}>{loading ? "Loading…" : "Load older work"}</button>}
  </>;
}

function Evidence({ data, label = "Evidence" }: { data: unknown; label?: string }) {
  if (data == null || (Array.isArray(data) && !data.length) || (typeof data === "object" && !Object.keys(data).length)) return null;
  return <details className={styles.details}><summary>{label}</summary>
    {typeof data === "string" ? <p>{data}</p>
      : Array.isArray(data) && data.every(item => typeof item === "string") ? <ul>{data.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : <pre>{JSON.stringify(data, null, 2)}</pre>}
  </details>;
}

export function RunDetail({ run, agents, allowExport = false, showRun, children }: {
  run: Run | null; agents: Agent[]; allowExport?: boolean; showRun: (id: string) => void; children?: ReactNode;
}) {
  if (!run) return <p className={styles.empty}>Open saved work or start a new request.</p>;
  return <>
    <div className={styles.blockHead}>
      <div><h2>{run.topic}</h2><p>{title(run.kind)} · {time(run.created_at)} IST</p></div>
      <div className={styles.actions}><Status value={run.status} />
        {allowExport && run.finished_at && <>
          <button type="button" className={styles.button} onClick={() => exportReport(run)}><AppIcon name="download" /> Export JSON</button>
          <button type="button" className={styles.button} onClick={() => exportReport(run,"csv")}>Export CSV</button>
        </>}
      </div>
    </div>
    {runSummary(run) && <p className={styles.muted}>{runSummary(run)}</p>}
    {run.parent_run_id && <button type="button" className={styles.button} onClick={() => showRun(run.parent_run_id!)}>Open previous request</button>}
    <ul className={styles.thread} aria-label="Run messages">
      {run.messages?.map(message => {
        const agent = agents.find(item => item.id === message.agent_id);
        return <li key={message.id} className={styles.message}>
          <header><div className={styles.person}>{agent && <Portrait agent={agent} small />}
            <span><strong>{agent?.name || (message.agent_id ? title(message.agent_id) : "Executive / system")}</strong><br /><small className={styles.muted}>{message.kind === "analysis" ? "AI analysis · hypothesis" : title(message.kind)}</small></span>
          </div><time>{time(message.created_at)}</time></header>
          <p>{message.text}</p>
          <Evidence data={message.evidence} />
        </li>;
      })}
    </ul>
    {run.result != null && <Evidence data={run.result} label="Structured result and source coverage" />}
    {!run.messages?.length && <p className={styles.empty}>{["queued", "running"].includes(run.status) ? "Waiting for recorded results." : "No messages were recorded for this run."}</p>}
    {children}
  </>;
}

export function Collaboration({ agents, kind, setKind, selectedIds, setSelectedIds, prompt, setPrompt, run, busy, onSend, history, showRun }: {
  agents: Agent[]; kind: "direct" | "meeting" | "standup"; setKind: (kind: "direct" | "meeting" | "standup") => void;
  selectedIds: string[]; setSelectedIds: (ids: string[]) => void; prompt: string; setPrompt: (value: string) => void;
  run: Run | null; busy: boolean; onSend: (event: FormEvent) => void; history: ReactNode; showRun: (id: string) => void;
}) {
  return <>
    <Heading detail="Send an evidence request, convene specific roles, or record a team standup.">Collaboration Hub</Heading>
    <div className={styles.conversation}>
      <aside className={styles.panel}><h2>Saved conversations</h2>{history}</aside>
      <section className={styles.panel} aria-label="Executive conversation">
        <form onSubmit={onSend}>
          <div className={styles.formRow}>
            <label className={styles.field}>Request type
              <select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
                <option value="direct">Direct conversation</option><option value="meeting">Team meeting</option><option value="standup">Daily standup</option>
              </select>
            </label>
            {kind === "direct" && <label className={styles.field}>Agent<select required value={selectedIds[0] || ""} onChange={event => setSelectedIds([event.target.value])}>
              <option value="" disabled>Select a role</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}
            </select></label>}
          </div>
          {kind === "meeting" && <fieldset className={styles.field}>
            <legend>Participants</legend><div className={styles.checks}>{agents.map(agent => (
              <label key={agent.id}><input type="checkbox" checked={selectedIds.includes(agent.id)} onChange={event => setSelectedIds(event.target.checked ? [...selectedIds, agent.id] : selectedIds.filter(id => id !== agent.id))} />{agent.name}</label>
            ))}</div><p className={styles.subtle}>Leave unselected to let the service select participants.</p>
          </fieldset>}
          <label className={styles.field}>{kind === "direct" ? "Question" : "Topic"}
            <textarea required value={prompt} maxLength={600} onChange={event => setPrompt(event.target.value)} placeholder={kind === "direct" ? "What did you accomplish today?" : "What should the team review?"} />
          </label>
          <button type="submit" className={`${styles.button} ${styles.primary} mt-3`} disabled={busy || !prompt.trim()}>
            <AppIcon name="send" />{busy ? "Submitting…" : kind === "direct" ? "Send request" : kind === "meeting" ? "Start meeting" : "Run standup"}
          </button>
        </form>
        <hr className="my-5 border-[color:var(--agentify-border)]" />
        <RunDetail run={run} agents={agents} showRun={showRun} />
      </section>
    </div>
  </>;
}

export function Reports({ snapshot, selectedId, setSelectedId, endingOn, setEndingOn, run, busy, onReport, history, showRun }: {
  snapshot: Snapshot; selectedId: string; setSelectedId: (id: string) => void; endingOn: string; setEndingOn: (value: string) => void; run: Run | null; busy: boolean;
  onReport: (event: FormEvent) => void; history: ReactNode; showRun: (id: string) => void;
}) {
  return <>
    <Heading detail="Generate and export time-bounded reports from recorded operations.">Executive Reports</Heading>
    <section className={styles.panel}>
      <form className={styles.formRow} onSubmit={onReport}>
        <label className={styles.field}>Report scope<select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          <option value="">Entire organization</option>{snapshot.agents.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.role}</option>)}
        </select></label>
        <label className={styles.field}>Through date (UTC)<input type="date" value={endingOn} max={new Date().toISOString().slice(0,10)} onChange={event => setEndingOn(event.target.value)} /></label>
        <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}><AppIcon name="book" />{busy ? "Requesting…" : "Generate report"}</button>
      </form>
      <MetricsTable agents={selectedId ? snapshot.agents.filter(item => item.id === selectedId) : snapshot.agents} />
    </section>
    <div className={styles.conversation + " mt-4"}>
      <aside className={styles.panel}><h2>Report history</h2>{history}</aside>
      <section className={styles.panel} aria-label="Executive report"><RunDetail run={run} agents={snapshot.agents} allowExport showRun={showRun} /></section>
    </div>
  </>;
}

export function ScheduleForm({ schedule, onChange, busy, onSave }: {
  schedule: Schedule; onChange: (schedule: Schedule) => void; busy: boolean; onSave: (event: FormEvent) => void;
}) {
  const clock = [schedule.hour, schedule.minute].map(value => String(value).padStart(2, "0")).join(":");
  return <section className={`${styles.panel} mt-4`}><h2>Daily standup schedule</h2>
    <form onSubmit={onSave}>
      <div className={styles.formRow}>
        <label className={styles.field}>Time zone<input required maxLength={64} value={schedule.timezone} onChange={event => onChange({...schedule,timezone:event.target.value})} /></label>
        <label className={styles.field}>Local time<input type="time" required value={clock} onChange={event => {
          if (!event.target.value) return;
          const [hour, minute] = event.target.value.split(":").map(Number);
          onChange({...schedule,hour,minute});
        }} /></label>
        <label className={styles.field}>Enabled<input type="checkbox" checked={schedule.enabled} onChange={event => onChange({...schedule,enabled:event.target.checked})} /></label>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? "Saving…" : "Save schedule"}</button>
      </div>
    </form>
    {schedule.next_run_at && <p className={styles.muted}>Next standup {time(schedule.next_run_at)} IST</p>}
  </section>;
}

export function isReportRun(kind: RunKind) {
  return kind === "report" || kind === "standup";
}
