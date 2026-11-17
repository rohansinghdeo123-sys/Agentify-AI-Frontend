"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { AppIcon, type AppIconName } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import { createAgentHqClient, type Agent, type Decision, type Run, type RunInput, type Schedule, type Snapshot, type TraceDetail } from "./api";
import { CommandCenter, Handoffs, Observability, Organization, time } from "./OverviewViews";
import { Collaboration, Reports, RunHistory, ScheduleForm, isReportRun } from "./WorkflowViews";
import styles from "./agentHq.module.css";

const VIEWS = [
  {id:"command", title:"Command Center", icon:"dashboard"},
  {id:"organization", title:"AI Organization", icon:"mission"},
  {id:"collaboration", title:"Collaboration Hub", icon:"study"},
  {id:"reports", title:"Executive Reports", icon:"book"},
  {id:"observability", title:"Performance & Observability", icon:"analytics"},
] as const satisfies ReadonlyArray<{id: string; title: string; icon: AppIconName}>;
type View = typeof VIEWS[number]["id"];

function mergeHistory(current: Run[], incoming: Run[]) {
  const rows = new Map(current.map(run => [run.id, run]));
  for (const run of incoming) {
    const previous = rows.get(run.id);
    if (!previous || run.updated_at >= previous.updated_at) rows.set(run.id, {...previous, ...run});
  }
  return [...rows.values()].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 180);
}

function errorText(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return "Agent HQ did not respond in time.";
  return error instanceof Error ? error.message : "The Agent HQ service did not respond.";
}

function Loading() {
  return <div className={`${styles.panel} ${styles.loading}`} role="status">
    Loading verified Agent HQ evidence<span aria-hidden="true" /><span aria-hidden="true" />
  </div>;
}

function Workspace({ getHeaders }: { getHeaders: ReturnType<typeof useAuth>["getAuthHeaders"] }) {
  const api = useMemo(() => createAgentHqClient(getHeaders), [getHeaders]);
  const [view, setView] = useState<View>("command");
  const [days, setDays] = useState(1);
  const [otherDays, setOtherDays] = useState("7");
  const [period, setPeriod] = useState("1");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [cursor, setCursor] = useState<string | null>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchResult, setSearchResult] = useState<{term: string; runs: Run[]; cursor: string | null} | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [endingOn, setEndingOn] = useState("");
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const traceInFlight = useRef<AbortController | null>(null);
  const [reportAgent, setReportAgent] = useState("");
  const [kind, setKind] = useState<"direct" | "meeting" | "standup">("direct");
  const [participants, setParticipants] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [submission, setSubmission] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const retryInput = useRef<RunInput | null>(null);
  const refreshQueued = useRef(false);
  const refreshInFlight = useRef<AbortController | null>(null);
  const currentScope = useRef({ days, activeRun });

  useEffect(() => { currentScope.current = {days,activeRun}; }, [days,activeRun]);

  const refresh = useCallback(async function refreshSnapshot() {
    if (refreshInFlight.current) { refreshQueued.current = true; return; }
    const controller = new AbortController();
    refreshInFlight.current = controller;
    const requested = currentScope.current;
    setRefreshing(true);
    const options = { signal: controller.signal };
    try {
      const [overview, history, selected] = await Promise.allSettled([
        api.snapshot(requested.days, options.signal),
        api.runs(undefined, options.signal),
        requested.activeRun ? api.run(requested.activeRun, options.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      if (overview.status === "fulfilled" && currentScope.current.days === requested.days) {
        setSnapshot(overview.value);
        setSnapshotError("");
      } else if (overview.status === "rejected" && currentScope.current.days === requested.days) setSnapshotError(errorText(overview.reason));
      if (history.status === "fulfilled") {
        setRuns(current => mergeHistory(current,history.value.runs));
        setCursor(current => current === undefined ? history.value.next_cursor : current);
      } else setError(errorText(history.reason));
      if (currentScope.current.activeRun === requested.activeRun) {
        if (selected.status === "fulfilled" && selected.value) setRun(selected.value);
        else if (selected.status === "rejected") setError(errorText(selected.reason));
      }
    } finally {
      if (refreshInFlight.current === controller) {
        refreshInFlight.current = null;
        setRefreshing(false);
        if (refreshQueued.current) {
          refreshQueued.current = false;
          void refreshSnapshot();
        }
      }
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const controller = new AbortController();
    let reconnect: number | undefined;
    let fallback: number | undefined;
    let version = "";
    let retries = 0;
    const connect = async () => {
      try {
        await api.events(controller.signal, () => {
          if (controller.signal.aborted) return;
          setConnected(true);
          if (fallback) window.clearInterval(fallback);
          fallback = undefined;
        }, nextVersion => {
          if (controller.signal.aborted || nextVersion === version) return;
          version = nextVersion;
          retries = 0;
          void refresh();
        });
      } catch { /* Retain the last verified snapshot while reconnecting. */ }
      if (controller.signal.aborted) return;
      setConnected(false);
      version = "";
      if (!fallback) fallback = window.setInterval(() => {
        if (!document.hidden) void refresh();
      }, 30_000);
      reconnect = window.setTimeout(connect, Math.min(30_000, 1500 * 2 ** Math.min(retries++, 5)));
    };
    void connect();
    return () => {
      controller.abort();
      refreshInFlight.current?.abort();
      refreshInFlight.current = null;
      refreshQueued.current = false;
      traceInFlight.current?.abort();
      window.clearTimeout(timer);
      window.clearTimeout(reconnect);
      window.clearInterval(fallback);
    };
  }, [api,refresh]);

  useEffect(() => {
    if (view !== "reports" || schedule) return;
    const controller = new AbortController();
    void api.schedule(controller.signal).then(value => {
      if (!controller.signal.aborted) { setSchedule(value); setScheduleError(""); }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setScheduleError(errorText(caught));
    });
    return () => controller.abort();
  }, [api,schedule,view]);

  function changeDays(next: number) {
    if (next === currentScope.current.days) return;
    currentScope.current = {...currentScope.current, days:next};
    setDays(next);
    refreshInFlight.current?.abort();
    refreshInFlight.current = null;
    void refresh();
  }

  function selectRun(id: string, destination?: View) {
    setError("");
    setActiveRun(id);
    const saved = (searchResult?.runs || []).find(item => item.id === id) || runs.find(item => item.id === id);
    setRun(saved || null);
    if (destination) setView(destination);
    currentScope.current = {...currentScope.current, activeRun:id};
    void api.run(id).then(value => {
      if (currentScope.current.activeRun === id) setRun(value);
    }).catch((caught: unknown) => {
      if (currentScope.current.activeRun === id) setError(errorText(caught));
    });
  }

  function openAgent(id?: string) {
    if (id) setSelectedAgent(id);
    setView("organization");
  }

  function talk(agent: Agent) {
    setActiveRun(null);
    setRun(null);
    currentScope.current = {...currentScope.current,activeRun:null};
    setKind("direct");
    setPrompt("");
    setParticipants([agent.id]);
    setView("collaboration");
  }

  function startStandup() {
    setKind("standup");
    setParticipants([]);
    setPrompt("Conduct today's AI team standup.");
    setView("collaboration");
  }

  async function createRun(input: Omit<RunInput, "request_id">) {
    setSubmission(true);
    setError("");
    const last = retryInput.current;
    const request = last && last.kind === input.kind && last.topic === input.topic
      && last.days === input.days && last.ending_on === input.ending_on && last.parent_run_id === input.parent_run_id
      && last.participant_ids.join() === input.participant_ids.join()
      ? last : {...input, request_id:crypto.randomUUID()};
    retryInput.current = request;
    try {
      const created = await api.create(request);
      retryInput.current = null;
      setActiveRun(created.id);
      currentScope.current = {...currentScope.current, activeRun:created.id};
      setRun(created);
      setRuns(current => mergeHistory(current,[created]));
      setPrompt("");
      void refresh();
    } catch (caught) { setError(errorText(caught)); }
    finally { setSubmission(false); }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (submission) return;
    const parent = kind === "direct" && run?.kind === "direct" && run.participant_ids[0] === participants[0] && run.status === "completed" ? run.id : undefined;
    const participant_ids = kind === "standup" ? [] : kind === "direct" ? participants.slice(0,1) : participants;
    void createRun({kind, topic:prompt.trim(), participant_ids, days, parent_run_id:parent});
  }

  function report(event: FormEvent) {
    event.preventDefault();
    if (submission || !snapshot || snapshot.days !== days) return;
    const agent = snapshot.agents.find(item => item.id === reportAgent);
    void createRun({kind:"report",topic:agent ? `${agent.name} report · past ${days} days` : `Organization report · past ${days} days`,
      participant_ids:agent ? [agent.id] : [], days, ending_on:endingOn || undefined});
  }

  async function decide(id: string, decision: Decision) {
    setDecisionBusy(id);
    setError("");
    try {
      const saved = await api.decide(id, decision, snapshot?.days || days);
      setSnapshot(current => current && ({...current, recommendations:current.recommendations.map(item => item.id === saved.id
        ? {...item,status:saved.status} : item)}));
      void refresh();
    } catch (caught) { setError(errorText(caught)); }
    finally { setDecisionBusy(null); }
  }

  async function loadMore() {
    const pageCursor = searchResult ? searchResult.cursor : cursor;
    if (!pageCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await api.runs(pageCursor,undefined,searchResult?.term);
      if (searchResult) setSearchResult({...searchResult,runs:mergeHistory(searchResult.runs,page.runs),cursor:page.next_cursor});
      else {
        setRuns(current => mergeHistory(current,page.runs));
        setCursor(page.next_cursor);
      }
    } catch (caught) { setError(errorText(caught)); }
    finally { setLoadingMore(false); }
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    if (!schedule || scheduleBusy) return;
    const { enabled, timezone, hour, minute } = schedule;
    setScheduleBusy(true);
    setScheduleNotice("");
    try {
      setSchedule(await api.updateSchedule({enabled,timezone:timezone.trim(),hour,minute}));
      setScheduleNotice("Standup schedule saved.");
      setScheduleError("");
    } catch (caught) { setScheduleError(errorText(caught)); }
    finally { setScheduleBusy(false); }
  }

  async function searchHistory(event: FormEvent) {
    event.preventDefault();
    const term = searchDraft.trim();
    if (!term) { setSearchResult(null); return; }
    setSearching(true);
    setError("");
    try {
      const page = await api.runs(undefined,undefined,term);
      setSearchResult({term,runs:page.runs,cursor:page.next_cursor});
    } catch (caught) { setError(errorText(caught)); }
    finally { setSearching(false); }
  }

  function history(reports: boolean) {
    const historyRows = searchResult?.runs || runs;
    return <>
      <form className={styles.formRow} onSubmit={event => void searchHistory(event)}>
        <label className={styles.field}>Search topics<input type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} maxLength={120} /></label>
        <button type="submit" className={styles.button} disabled={searching || loadingMore}><AppIcon name="search" />{searching ? "Searching…" : "Search"}</button>
        {searchResult && <button type="button" className={styles.button} disabled={searching || loadingMore} onClick={() => {setSearchResult(null);setSearchDraft("");}}>Clear</button>}
      </form>
      {searchResult && <p className={styles.subtle}>Results for {searchResult.term}</p>}
      <RunHistory runs={historyRows.filter(item => reports ? isReportRun(item.kind) : item.kind !== "report")} selected={activeRun} onSelect={selectRun}
      onMore={() => void loadMore()} more={Boolean(searchResult ? searchResult.cursor : cursor)} loading={loadingMore} />
    </>;
  }

  const selectedView = VIEWS.find(item => item.id === view)!;
  const showRun = (id: string) => {
    const target = [...runs, ...(snapshot?.active_runs || [])].find(item => item.id === id);
    selectRun(id, target && isReportRun(target.kind) ? "reports" : "collaboration");
  };

  const showTrace = (id: string) => {
    traceInFlight.current?.abort();
    const controller = new AbortController();
    traceInFlight.current = controller;
    setTrace(null);
    setError("");
    setView("observability");
    void api.trace(id,controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setTrace(value);
      window.requestAnimationFrame(() => document.getElementById("agent-hq-trace")?.focus());
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(errorText(caught));
    });
  };

  return <main id="main-content" className={styles.shell}>
    <div className={styles.frame}>
      <aside className={styles.sidebar}>
        <p className={styles.brand}><span className={styles.brandMark}><AppIcon name="spark" /></span>Agent HQ</p>
        <nav className={styles.nav} aria-label="Agent HQ sections">{VIEWS.map(item => <button key={item.id} type="button"
          aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><AppIcon name={item.icon} />{item.title}</button>)}</nav>
        <Link className={styles.back} href="/dashboard/internal/admin"><AppIcon name="arrowRight" />Admin console</Link>
      </aside>
      <div className={styles.content}>
        <div className={styles.top}>
          <span className={styles.topTitle}>{selectedView.title}</span>
          <div className={styles.actions}>
            <label className={`${styles.field} !mt-0`}><span className="sr-only">Reporting period</span>
              <select value={period} onChange={event => {
                setPeriod(event.target.value);
                if (event.target.value !== "custom") changeDays(Number(event.target.value));
              }}>
                <option value="1">Past 24 hours</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="custom">Custom period</option>
              </select></label>
            {period === "custom" && <form className={styles.actions} onSubmit={event => { event.preventDefault(); changeDays(Number(otherDays)); }}>
              <label className={`${styles.field} !mt-0`}><span className="sr-only">Number of days</span><input className="max-w-20" type="number" min={1} max={90} required value={otherDays} onChange={event => setOtherDays(event.target.value)} /></label>
              <button type="submit" className={styles.button}>Apply days</button>
            </form>}
            <button type="button" className={styles.button} onClick={() => void refresh()} disabled={refreshing}><AppIcon name="history" />{refreshing ? "Refreshing…" : "Refresh"}</button>
            <ThemeToggle compact />
          </div>
        </div>
        {snapshotError && <p className={styles.notice} role="alert">{snapshotError}{snapshot ? ` · Showing the last verified snapshot from ${time(snapshot.generated_at)} IST.` : ""}</p>}
        {error && <p className={styles.notice} role="alert">{error}</p>}
        {!snapshot && (snapshotError ? <h1 className="text-2xl font-semibold">Agent HQ is unavailable</h1> : <Loading />)}
        {snapshot && <>
          {snapshot.days !== days && refreshing && <p className={styles.notice} role="status">Loading the selected reporting period…</p>}
          {view === "command" && <CommandCenter snapshot={snapshot} connected={connected} openOrganization={openAgent} openStandup={startStandup}
            showRun={showRun} showTrace={showTrace} briefing={runs.find(item => item.kind === "standup" && item.status === "completed")} busy={decisionBusy} onDecision={(id, status) => void decide(id,status)} />}
          {view === "organization" && <Organization snapshot={snapshot} selected={selectedAgent} onSelect={setSelectedAgent}
            onReport={agent => { setReportAgent(agent.id); setView("reports"); }} onTalk={talk} />}
          {view === "collaboration" && <><Collaboration agents={snapshot.agents} kind={kind} setKind={value => {
            setKind(value); setParticipants([]); setPrompt(value === "standup" ? "Conduct today's AI team standup." : "");
          }} selectedIds={participants} setSelectedIds={setParticipants} prompt={prompt} setPrompt={setPrompt}
            run={run} busy={submission} onSend={send} showRun={showRun} history={history(false)} />
            <section className={`${styles.panel} mt-4`}><h2>Recorded workflow handoffs</h2><Handoffs items={snapshot.handoffs || []} agents={snapshot.agents} /></section>
          </>}
          {view === "reports" && <>
            <Reports snapshot={snapshot} selectedId={reportAgent} setSelectedId={setReportAgent} endingOn={endingOn} setEndingOn={setEndingOn} run={run && isReportRun(run.kind) ? run : null}
              busy={submission || snapshot.days !== days} onReport={report} history={history(true)} showRun={showRun} />
            {schedule && <ScheduleForm schedule={schedule} onChange={setSchedule} busy={scheduleBusy} onSave={event => void saveSchedule(event)} />}
            {scheduleError && <p className={styles.notice} role="alert">{scheduleError}</p>}
            {scheduleNotice && <p className={styles.notice} role="status">{scheduleNotice}</p>}
          </>}
          {view === "observability" && <Observability snapshot={snapshot} showTrace={showTrace} trace={trace} busy={decisionBusy} onDecision={(id, status) => void decide(id,status)} />}
        </>}
      </div>
    </div>
  </main>;
}

export default function AgentHq() {
  const { user, loading, claimsLoading, isAdmin, isFounderAdmin, getAuthHeaders } = useAuth();
  if (loading || claimsLoading) return <main id="main-content" className={`${styles.shell} p-5`}><Loading /></main>;
  if (!user || !isAdmin || !isFounderAdmin) return <main id="main-content" className={`${styles.shell} p-5`}>
    <section className={styles.panel}><h1 className="text-2xl font-semibold">Agent HQ is restricted</h1>
      <p>A verified executive account is required.</p><Link className={`${styles.button} mt-4`} href="/dashboard">Return to dashboard</Link>
    </section>
  </main>;
  return <Workspace key={user.uid} getHeaders={getAuthHeaders} />;
}
