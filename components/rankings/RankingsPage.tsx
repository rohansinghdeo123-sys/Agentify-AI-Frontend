"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { AppIcon, LoadingSkeleton } from "@/components/ui/Polished";
import {
  createRankChase,
  formatRankNumber,
  leaderboardDisplayName,
  leagueDivisionForXp,
  learnerInitials,
  type LeaderboardEntry,
  type LeagueDivision,
  type RankChase,
} from "@/features/rankings/leaderboard";
import {
  remainingChallengeSeconds,
  type RivalChallenge,
  type RivalMission,
} from "@/features/rankings/rival";
import {
  useRankings,
  type RivalChallengeStatus,
} from "@/features/rankings/useRankings";
import styles from "./rankings.module.css";

type RankingsView = "leaderboard" | "rival";

type RankingsExperienceProps = {
  entries: LeaderboardEntry[];
  challenge: RivalChallenge | null;
  challengeStatus: RivalChallengeStatus;
  currentEntry: LeaderboardEntry | null;
  currentDisplayName: string;
  currentClassLevel: string;
  userId: string;
  error: string | null;
  onRetry: () => void;
  initialView?: RankingsView;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BATTLE_COPY: Record<
  RivalChallenge["battleStatus"],
  { eyebrow: string; title: string; detail: string }
> = {
  leading: {
    eyebrow: "Lead secured",
    title: "You control the arena",
    detail: "Protect the gap with one more focused learning session.",
  },
  trailing: {
    eyebrow: "Chase is live",
    title: "The lead is within reach",
    detail: "A strong session can still turn this weekly duel.",
  },
  tied: {
    eyebrow: "Dead heat",
    title: "The next XP wins the lead",
    detail: "You are level. Every completed learning action matters now.",
  },
  unmatched: {
    eyebrow: "Open training week",
    title: "Build the score to beat",
    detail: "Your weekly work is still building momentum while matching continues.",
  },
};

function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatActivityTime(value: string, now: number) {
  const time = new Date(value).getTime();
  if (!value || !Number.isFinite(time)) return "This week";
  const minutes = Math.max(1, Math.round((now - time) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function missionProgress(mission: RivalMission) {
  return Math.max(
    0,
    Math.min(100, Math.round((mission.progress / Math.max(1, mission.target)) * 100)),
  );
}

function DivisionBadge({ division }: { division: LeagueDivision }) {
  return (
    <span className={styles.divisionBadge} data-division={division.key}>
      <i className={styles.divisionGlyph} aria-hidden="true" />
      <span>{division.shortLabel}</span>
    </span>
  );
}

function LearnerAvatar({ name, tone }: { name: string; tone: "me" | "rival" }) {
  return (
    <span className={styles.learnerAvatar} data-tone={tone} aria-hidden="true">
      <span>{learnerInitials(name)}</span>
    </span>
  );
}

function LeagueTable({
  entries,
  currentUserId,
  currentDisplayName,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
  currentDisplayName: string;
}) {
  if (!entries.length) {
    return (
      <div className={styles.emptyBoard} role="status">
        <span className={styles.emptyBoardIcon} aria-hidden="true">
          <AppIcon name="analytics" />
        </span>
        <h3>The league is waiting for its first score</h3>
        <p>Completed learning activity will place students into the standings.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableViewport}>
      <table className={styles.leaderboardTable}>
        <caption className="sr-only">
          AgentifyAI global learner rankings, ordered by total XP, streak, and completed tests.
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Learner</th>
            <th scope="col" className={styles.divisionColumn}>Division</th>
            <th scope="col" className={styles.momentumColumn}>Momentum</th>
            <th scope="col">XP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const current = entry.user_id === currentUserId;
            const displayName = leaderboardDisplayName(
              entry,
              currentUserId,
              currentDisplayName,
            );
            const division = leagueDivisionForXp(entry.xp);
            const rowStyle = {
              "--ranking-row-index": Math.min(index, 10),
            } as CSSProperties;

            return (
              <tr
                key={entry.user_id}
                className={styles.leaderboardRow}
                data-current={current ? "true" : "false"}
                data-podium={entry.rank <= 3 ? entry.rank : undefined}
                style={rowStyle}
              >
                <td className={styles.rankCell}>
                  <span className={styles.rankCrest}>
                    <strong>{entry.rank}</strong>
                  </span>
                </td>
                <th scope="row" className={styles.learnerCell}>
                  <span className={styles.tableAvatar} aria-hidden="true">
                    {learnerInitials(displayName)}
                  </span>
                  <span className={styles.learnerIdentity}>
                    <span className={styles.learnerNameLine}>
                      <strong>{displayName}</strong>
                      {current ? <em>You</em> : null}
                    </span>
                    <span className={styles.learnerMeta}>
                      {entry.class_level || "Open class"}
                      {entry.class_rank ? ` · Class #${entry.class_rank}` : ""}
                    </span>
                    <span className={styles.mobileMeta}>
                      {division.shortLabel} · {entry.streak}d streak
                    </span>
                  </span>
                </th>
                <td className={styles.divisionColumn}>
                  <DivisionBadge division={division} />
                </td>
                <td className={styles.momentumColumn}>
                  <span className={styles.momentumPrimary}>
                    <AppIcon name="clock" />
                    {entry.streak} day{entry.streak === 1 ? "" : "s"}
                  </span>
                  <small>{entry.total_tests} completed tests</small>
                </td>
                <td className={styles.xpCell}>
                  <strong>{formatRankNumber(entry.xp)}</strong>
                  <span>XP</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardView({
  entries,
  currentEntry,
  currentDisplayName,
  userId,
  error,
  onRetry,
  hidden,
}: Pick<
  RankingsExperienceProps,
  "entries" | "currentEntry" | "currentDisplayName" | "userId" | "error" | "onRetry"
> & { hidden: boolean }) {
  const hasStandings = entries.length > 0;

  return (
    <section
      id="rankings-panel-leaderboard"
      role="tabpanel"
      aria-labelledby="rankings-tab-leaderboard"
      className={styles.viewPanel}
      hidden={hidden}
    >
      <article className={styles.board} aria-labelledby="league-standings-title">
        <div className={styles.boardHeader}>
          <div className={styles.boardTitleGroup}>
            <span className={styles.boardIcon} aria-hidden="true">
              <AppIcon name="analytics" />
            </span>
            <div>
              <p className={styles.eyebrow}>Global · All-time XP</p>
              <h2 id="league-standings-title">Global division standings</h2>
              <p>XP sets the order; streak and completed tests break a tie.</p>
            </div>
          </div>
          <div className={styles.boardSummary}>
            <span>
              <small>Learners</small>
              <strong>{formatRankNumber(entries.length)}</strong>
            </span>
            <span>
              <small>Your position</small>
              <strong>{currentEntry ? `#${currentEntry.rank}` : "—"}</strong>
            </span>
          </div>
        </div>

        {error && hasStandings ? (
          <div className={styles.boardAlert} role="status">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>Refresh standings</button>
          </div>
        ) : null}

        {error && !hasStandings ? (
          <div className={styles.boardFailure} role="alert">
            <span className={styles.emptyBoardIcon} aria-hidden="true">
              <AppIcon name="analytics" />
            </span>
            <h3>Standings could not be reached</h3>
            <p>{error}</p>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        ) : (
          <LeagueTable
            entries={entries}
            currentUserId={userId}
            currentDisplayName={currentDisplayName}
          />
        )}
      </article>
    </section>
  );
}

function RivalMeter({
  value,
  label,
  valueText,
}: {
  value: number;
  label: string;
  valueText: string;
}) {
  return (
    <div className={styles.meterBlock}>
      <div className={styles.meterLabels} aria-hidden="true">
        <span>You</span>
        <span>{label}</span>
        <span>Rival</span>
      </div>
      <div
        className={styles.rivalMeter}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={valueText}
      >
        <span style={{ width: `${Math.max(4, Math.min(96, value))}%` }} />
        <i aria-hidden="true" />
      </div>
    </div>
  );
}

function WeeklyBattleDetails({
  challenge,
  now,
}: {
  challenge: RivalChallenge;
  now: number;
}) {
  const rival = challenge.rival;
  const peak = Math.max(
    1,
    ...challenge.me.daily_xp,
    ...(rival?.daily_xp ?? [0]),
  );

  return (
    <details className={styles.battleDetails}>
      <summary>
        <span>
          <AppIcon name="mission" />
          Battle details
        </span>
        <small>Missions, seven-day pulse, and rival activity</small>
      </summary>
      <div className={styles.detailsGrid}>
        <section aria-labelledby="battle-missions-title">
          <div className={styles.detailHeading}>
            <p className={styles.eyebrow}>Mission deck</p>
            <h3 id="battle-missions-title">This week&apos;s objectives</h3>
          </div>
          {challenge.missions.length ? (
            <ol className={styles.missionList}>
              {challenge.missions.map((mission) => {
                const percent = missionProgress(mission);
                return (
                  <li key={mission.id} data-complete={mission.completed ? "true" : "false"}>
                    <span className={styles.missionCheck} aria-hidden="true">
                      {mission.completed ? <AppIcon name="check" /> : null}
                    </span>
                    <div>
                      <p>{mission.title}</p>
                      <small>{mission.detail}</small>
                      <div
                        className={styles.missionMeter}
                        role="progressbar"
                        aria-label={`${mission.title}: ${percent}% complete`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                    <strong>{mission.completed ? "Done" : `${percent}%`}</strong>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.detailEmpty}>New objectives will appear with the next match update.</p>
          )}
        </section>

        <section aria-labelledby="battle-pulse-title">
          <div className={styles.detailHeading}>
            <p className={styles.eyebrow}>Battle pulse</p>
            <h3 id="battle-pulse-title">Seven-day XP rhythm</h3>
          </div>
          <div className={styles.pulseChart} aria-hidden="true">
            {DAYS.map((day, index) => (
              <div key={day}>
                <span className={styles.pulseBars}>
                  <i
                    data-side="me"
                    style={{
                      height: `${Math.max(5, Math.round(((challenge.me.daily_xp[index] || 0) / peak) * 100))}%`,
                    }}
                  />
                  <i
                    data-side="rival"
                    style={{
                      height: `${Math.max(5, Math.round((((rival?.daily_xp[index]) || 0) / peak) * 100))}%`,
                    }}
                  />
                </span>
                <small>{day}</small>
              </div>
            ))}
          </div>
          <p className="sr-only">
            {DAYS.map((day, index) =>
              `${day}: you ${challenge.me.daily_xp[index] || 0} XP, ${rival?.name || "rival"} ${rival?.daily_xp[index] || 0} XP`,
            ).join(". ")}
          </p>
          <div className={styles.pulseLegend} aria-hidden="true">
            <span data-side="me">You</span>
            <span data-side="rival">{rival?.name || "Rival"}</span>
          </div>

          {rival?.activity.length ? (
            <ul className={styles.activityFeed} aria-label="Recent rival activity">
              {rival.activity.slice(0, 3).map((item, index) => (
                <li key={`${item.completed_at}-${index}`}>
                  <span aria-hidden="true" />
                  <p>
                    <strong>{item.type}</strong>
                    {item.topic ? ` · ${item.topic}` : ""}
                  </p>
                  <small>+{item.xp_earned} XP · {formatActivityTime(item.completed_at, now)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.detailEmpty}>No rival activity has landed yet. First move is yours.</p>
          )}
        </section>
      </div>
    </details>
  );
}

function WeeklyRivalArena({
  challenge,
  currentDisplayName,
  secondsLeft,
  now,
  challengeStatus,
  onRetry,
}: {
  challenge: RivalChallenge;
  currentDisplayName: string;
  secondsLeft: number;
  now: number;
  challengeStatus: RivalChallengeStatus;
  onRetry: () => void;
}) {
  const rival = challenge.rival;
  const copy = BATTLE_COPY[challenge.battleStatus];
  const totalXp = challenge.myWeekXp + challenge.rivalWeekXp;
  const myShare = !rival || totalXp === 0
    ? 50
    : Math.round((challenge.myWeekXp / totalXp) * 100);
  const spotlight = challenge.missions.find((mission) => !mission.completed)
    || challenge.missions[0]
    || null;

  return (
    <article
      className={styles.rivalArena}
      data-status={challenge.battleStatus}
      aria-labelledby="weekly-rival-title"
    >
      <header className={styles.arenaHeader}>
        <div>
          <span className={styles.liveLabel}>
            <i aria-hidden="true" />
            Weekly Rival Arena
          </span>
          <h2 id="weekly-rival-title">{copy.title}</h2>
          <p>{copy.detail}</p>
        </div>
        <div className={styles.countdown} role="timer" aria-label={`${formatCountdown(secondsLeft)} left in this week's rival challenge`}>
          <AppIcon name="clock" />
          <span>
            <strong>{formatCountdown(secondsLeft)}</strong>
            <small>left this week</small>
          </span>
        </div>
      </header>

      {challenge.lastWeek ? (
        <div className={styles.lastWeek} data-outcome={challenge.lastWeek.outcome}>
          <AppIcon name={challenge.lastWeek.outcome === "won" ? "spark" : "history"} />
          <span>
            Last week: {challenge.lastWeek.outcome === "won" ? "victory over" : challenge.lastWeek.outcome === "tied" ? "level with" : "challenged by"} {challenge.lastWeek.rival_name}
          </span>
          <strong>+{challenge.lastWeek.reward_xp} XP</strong>
        </div>
      ) : null}

      <div className={styles.duelStage}>
        <div className={styles.competitor} data-side="me">
          <LearnerAvatar name={currentDisplayName} tone="me" />
          <div>
            <span>You</span>
            <h3>{currentDisplayName}</h3>
            <strong>{formatRankNumber(challenge.myWeekXp)} XP</strong>
            <small>{challenge.me.sessions} sessions · {challenge.me.accuracy}% accuracy · {challenge.me.active_days}/7 active days</small>
          </div>
        </div>

        <div className={styles.versusCrest} data-status={challenge.battleStatus}>
          <span>VS</span>
          <strong>{copy.eyebrow}</strong>
          {rival && challenge.battleStatus !== "tied" ? (
            <small>{formatRankNumber(challenge.xpGap)} XP gap</small>
          ) : null}
        </div>

        <div className={styles.competitor} data-side="rival">
          <LearnerAvatar name={rival?.name || "Rival"} tone="rival" />
          <div>
            <span>Rival</span>
            <h3>{rival?.name || "Matching in progress"}</h3>
            <strong>{rival ? `${formatRankNumber(challenge.rivalWeekXp)} XP` : "Open week"}</strong>
            <small>
              {rival
                ? `${rival.sessions} sessions · ${rival.accuracy}% accuracy · ${rival.active_days}/7 active days`
                : "Your score is becoming the benchmark."}
            </small>
          </div>
        </div>
      </div>

      <RivalMeter
        value={myShare}
        label="Weekly XP momentum"
        valueText={`You have ${challenge.myWeekXp} XP and ${rival?.name || "your rival"} has ${challenge.rivalWeekXp} XP`}
      />

      <div className={styles.arenaRail}>
        <span className={styles.railItem}>
          <AppIcon name="spark" />
          <span>
            <small>Victory reward</small>
            <strong>+{challenge.rewardWinXp} XP · {challenge.rewardBadge}</strong>
          </span>
        </span>
        <span className={styles.railItem}>
          <AppIcon name="check" />
          <span>
            <small>Mission progress</small>
            <strong>{challenge.missions.filter((mission) => mission.completed).length}/{challenge.missions.length || 0} complete</strong>
          </span>
        </span>
        {spotlight ? (
          <span className={styles.railMission}>
            <span>
              <small>Next power play</small>
              <strong>{spotlight.title}</strong>
            </span>
            <em>{missionProgress(spotlight)}%</em>
          </span>
        ) : null}
      </div>

      <WeeklyBattleDetails challenge={challenge} now={now} />

      {challengeStatus === "error" ? (
        <div className={styles.weeklyReconnect} role="status">
          <span>Showing your last confirmed rival snapshot while the live arena reconnects.</span>
          <button type="button" onClick={onRetry}>Reconnect arena</button>
        </div>
      ) : null}
    </article>
  );
}

function RankChaseArena({
  chase,
  currentDisplayName,
  currentUserId,
  challengeStatus,
  onRetry,
}: {
  chase: RankChase;
  currentDisplayName: string;
  currentUserId: string;
  challengeStatus: RivalChallengeStatus;
  onRetry: () => void;
}) {
  const myName = leaderboardDisplayName(chase.me, currentUserId, currentDisplayName);
  const opponentName = leaderboardDisplayName(chase.opponent, currentUserId, currentDisplayName);
  const meDivision = leagueDivisionForXp(chase.me.xp);
  const opponentDivision = leagueDivisionForXp(chase.opponent.xp);
  const chasing = chase.mode === "chasing";

  return (
    <article
      className={styles.rivalArena}
      data-status={chasing ? "trailing" : "leading"}
      aria-labelledby="rank-chase-title"
    >
      <header className={styles.arenaHeader}>
        <div>
          <span className={styles.liveLabel}>
            <i aria-hidden="true" />
            Live Rank Chase
          </span>
          <h2 id="rank-chase-title">{chasing ? `Rank #${chase.opponent.rank} is in sight` : "Defend the top of the league"}</h2>
          <p>
            {chasing
              ? `${formatRankNumber(chase.xpGap)} more XP moves you ahead of ${opponentName}`
              : `${formatRankNumber(chase.xpGap)} XP currently protects your lead over ${opponentName}`}
          </p>
        </div>
        <span className={styles.rankChaseBadge}>
          <AppIcon name="analytics" />
          <span>
            <small>{chasing ? "Target" : "Current"}</small>
            <strong>#{chasing ? chase.opponent.rank : chase.me.rank}</strong>
          </span>
        </span>
      </header>

      <div className={styles.duelStage}>
        <div className={styles.competitor} data-side="me">
          <LearnerAvatar name={myName} tone="me" />
          <div>
            <span>You · Rank #{chase.me.rank}</span>
            <h3>{myName}</h3>
            <strong>{formatRankNumber(chase.me.xp)} XP</strong>
            <small>{meDivision.label} · {chase.me.streak} day streak · {chase.me.total_tests} tests</small>
          </div>
        </div>

        <div className={styles.versusCrest} data-status={chasing ? "trailing" : "leading"}>
          <span>VS</span>
          <strong>{chasing ? "Close the gap" : "Lead defense"}</strong>
          <small>{formatRankNumber(chase.xpGap)} XP</small>
        </div>

        <div className={styles.competitor} data-side="rival">
          <LearnerAvatar name={opponentName} tone="rival" />
          <div>
            <span>{chasing ? "Next rank" : "Closest challenger"} · #{chase.opponent.rank}</span>
            <h3>{opponentName}</h3>
            <strong>{formatRankNumber(chase.opponent.xp)} XP</strong>
            <small>{opponentDivision.label} · {chase.opponent.streak} day streak · {chase.opponent.total_tests} tests</small>
          </div>
        </div>
      </div>

      <RivalMeter
        value={chase.progress}
        label={chasing ? "Progress to the next rank" : "Share of the top-two XP"}
        valueText={chasing
          ? `${chase.xpGap} XP needed to pass ${opponentName}`
          : `${chase.xpGap} XP lead over ${opponentName}`}
      />

      <div className={styles.rankChaseRail}>
        <div>
          <p className={styles.eyebrow}>Your next move</p>
          <strong>{chasing ? `Reach ${formatRankNumber(chase.targetXp)} XP` : "Keep learning to protect the lead"}</strong>
          <span>Rank Chase uses live all-time standings—no estimated activity or invented scores.</span>
        </div>
        <div className={styles.chaseStats}>
          <span><small>Your streak</small><strong>{chase.me.streak}d</strong></span>
          <span><small>Tests done</small><strong>{chase.me.total_tests}</strong></span>
          <span><small>Your division</small><strong>{meDivision.shortLabel}</strong></span>
        </div>
      </div>

      {challengeStatus === "error" ? (
        <div className={styles.weeklyReconnect} role="status">
          <span>Weekly matchmaking is reconnecting. Your live Rank Chase remains active.</span>
          <button type="button" onClick={onRetry}>Retry weekly match</button>
        </div>
      ) : null}
    </article>
  );
}

function OpenArena({
  currentEntry,
  entries,
  onRetry,
}: {
  currentEntry: LeaderboardEntry | null;
  entries: LeaderboardEntry[];
  onRetry: () => void;
}) {
  return (
    <article
      className={`${styles.rivalArena} ${styles.openArena}`}
      aria-labelledby="open-arena-title"
    >
      <span className={styles.openArenaIcon} aria-hidden="true">
        <AppIcon name="spark" />
      </span>
      <p className={styles.eyebrow}>Rival Arena</p>
      <h2 id="open-arena-title">{currentEntry ? "No challenger is close enough yet" : "Earn XP to enter the arena"}</h2>
      <p>
        {entries.length <= 1
          ? "Your first active league rival will appear when another learner joins the standings."
          : "Complete a tracked learning action and AgentifyAI will identify your nearest live challenger."}
      </p>
      <button type="button" onClick={onRetry}>Refresh matchmaking</button>
    </article>
  );
}

function RivalView({
  entries,
  challenge,
  challengeStatus,
  currentEntry,
  currentDisplayName,
  userId,
  onRetry,
  clockTime,
  hidden,
}: Pick<
  RankingsExperienceProps,
  "entries" | "challenge" | "challengeStatus" | "currentEntry" | "currentDisplayName" | "userId" | "onRetry"
> & { clockTime: number; hidden: boolean }) {
  const chase = useMemo(
    () => createRankChase(entries, userId),
    [entries, userId],
  );
  const secondsLeft = challenge
    ? remainingChallengeSeconds(challenge, clockTime)
    : 0;

  return (
    <section
      id="rankings-panel-rival"
      role="tabpanel"
      aria-labelledby="rankings-tab-rival"
      className={styles.viewPanel}
      hidden={hidden}
    >
      {challenge ? (
        <WeeklyRivalArena
          challenge={challenge}
          currentDisplayName={currentDisplayName}
          secondsLeft={secondsLeft}
          now={clockTime}
          challengeStatus={challengeStatus}
          onRetry={onRetry}
        />
      ) : chase ? (
        <RankChaseArena
          chase={chase}
          currentDisplayName={currentDisplayName}
          currentUserId={userId}
          challengeStatus={challengeStatus}
          onRetry={onRetry}
        />
      ) : (
        <OpenArena currentEntry={currentEntry} entries={entries} onRetry={onRetry} />
      )}
    </section>
  );
}

function RankingsLoading() {
  return (
    <div className={styles.page} aria-busy="true">
      <span className="sr-only" role="status">Loading Global Rankings</span>
      <LoadingSkeleton className={styles.loadingHeader} />
      <LoadingSkeleton className={styles.loadingBoard} />
    </div>
  );
}

export function RankingsExperience({
  entries,
  challenge,
  challengeStatus,
  currentEntry,
  currentDisplayName,
  currentClassLevel,
  userId,
  error,
  onRetry,
  initialView = "leaderboard",
}: RankingsExperienceProps) {
  const [activeView, setActiveView] = useState<RankingsView>(initialView);
  const [clockTime, setClockTime] = useState(() => Date.now());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentDivision = currentEntry
    ? leagueDivisionForXp(currentEntry.xp)
    : null;

  useEffect(() => {
    const syncView = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setActiveView(requested === "rival" ? "rival" : initialView);
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [initialView]);

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setClockTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  function selectView(view: RankingsView) {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === "rival") url.searchParams.set("view", "rival");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex = index === 0 ? 1 : 0;
    const nextView: RankingsView = nextIndex === 0 ? "leaderboard" : "rival";
    selectView(nextView);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.page} data-view={activeView}>
      <header className={styles.commandPanel}>
        <div className={styles.masthead}>
          <div className={styles.titleGroup}>
            <span className={styles.leagueMark} aria-hidden="true">
              <AppIcon name="trophy" />
            </span>
            <div>
              <p className={styles.eyebrow}>Global Rankings</p>
              <h1>Global Learning League</h1>
              <p>Earn XP through real learning, climb divisions, and challenge the student closest to your rank.</p>
            </div>
          </div>

          <dl className={styles.leagueStats}>
            <div>
              <dt>Global rank</dt>
              <dd>{currentEntry ? `#${currentEntry.rank}` : "—"}</dd>
            </div>
            <div>
              <dt>League XP</dt>
              <dd>{currentEntry ? formatRankNumber(currentEntry.xp) : "0"}</dd>
            </div>
            <div>
              <dt>Division</dt>
              <dd>{currentDivision?.shortLabel || "Unranked"}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.commandRail}>
          <div className={styles.tabs} role="tablist" aria-label="Global rankings views">
            <button
              ref={(node) => { tabRefs.current[0] = node; }}
              id="rankings-tab-leaderboard"
              type="button"
              role="tab"
              aria-selected={activeView === "leaderboard"}
              aria-controls="rankings-panel-leaderboard"
              tabIndex={activeView === "leaderboard" ? 0 : -1}
              onClick={() => selectView("leaderboard")}
              onKeyDown={(event) => handleTabKeyDown(event, 0)}
            >
              <AppIcon name="analytics" />
              Leaderboard
            </button>
            <button
              ref={(node) => { tabRefs.current[1] = node; }}
              id="rankings-tab-rival"
              type="button"
              role="tab"
              aria-selected={activeView === "rival"}
              aria-controls="rankings-panel-rival"
              tabIndex={activeView === "rival" ? 0 : -1}
              onClick={() => selectView("rival")}
              onKeyDown={(event) => handleTabKeyDown(event, 1)}
            >
              <AppIcon name="spark" />
              Rival Arena
              <span data-status={challenge ? "live" : "chase"}>
                {challenge ? "Live" : "Rank chase"}
              </span>
            </button>
          </div>
          <div className={styles.scopeLabel}>
            <span>{formatRankNumber(entries.length)} learners</span>
            <i aria-hidden="true" />
            <span>{currentClassLevel ? `Your class: ${currentClassLevel}` : "All classes"}</span>
          </div>
        </div>
      </header>

      <LeaderboardView
        entries={entries}
        currentEntry={currentEntry}
        currentDisplayName={currentDisplayName}
        userId={userId}
        error={error}
        onRetry={onRetry}
        hidden={activeView !== "leaderboard"}
      />
      <RivalView
        entries={entries}
        challenge={challenge}
        challengeStatus={challengeStatus}
        currentEntry={currentEntry}
        currentDisplayName={currentDisplayName}
        userId={userId}
        onRetry={onRetry}
        clockTime={clockTime}
        hidden={activeView !== "rival"}
      />
    </div>
  );
}

export function RankingsPage() {
  const rankings = useRankings();

  if (rankings.loading) return <RankingsLoading />;

  return (
    <RankingsExperience
      entries={rankings.entries}
      challenge={rankings.challenge}
      challengeStatus={rankings.challengeStatus}
      currentEntry={rankings.currentEntry}
      currentDisplayName={rankings.currentDisplayName}
      currentClassLevel={rankings.currentClassLevel}
      userId={rankings.userId}
      error={rankings.error}
      onRetry={rankings.retry}
    />
  );
}
