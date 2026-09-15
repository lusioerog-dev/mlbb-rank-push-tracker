import { playerName } from "../../../packages/tracker/players";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Download,
  Gamepad2,
  LayoutDashboard,
  List,
  MapPinned,
  Plus,
  Settings2,
  ShieldCheck,
  Star,
  Swords,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Match, TrackerState } from "../../../packages/tracker/model";
import {
  currentRank,
  ordered,
  stats,
  accountProgression,
  dailyProgression,
  playerContributions,
  formatPlaytime,
  rankTargetProgress,
  resolvedRankTarget,
} from "../../../packages/tracker/model";
import { rankLabel } from "../../../packages/tracker/rank-rules";
import {
  exportCsv,
  loadState,
  parseBackup,
  persistState,
  storageKey,
} from "../../../packages/tracker/storage";
import { localInput } from "../../../packages/tracker/time";
import { MatchForm } from "./MatchForm";
import { MatchHistory } from "./MatchHistory";
import { PerformancePage } from "./Performance";
import { PlayerScope } from "./PlayerScope";
import { Settings } from "./Settings";
import type { RemoteStore } from "./Cloud";
import { AccountPage } from "./Account";
import type { AccountSession } from "./Account";

const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value}`;
const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
function download(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Page =
  "overview" | "matches" | "heroes" | "lanes" | "settings" | "account";
export function App({
  remote,
  account,
}: {
  remote?: RemoteStore;
  account?: AccountSession;
}) {
  const [state, setState] = useState<TrackerState | null>(null);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("overview");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Match | null | undefined>(undefined);
  const [player, setPlayer] = useState("all");
  const [windowSize, setWindowSize] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [graphMode, setGraphMode] = useState<"day" | "game">("day");
  const file = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const stateRef = useRef<TrackerState | null>(null);
  const editingRef = useRef(editing);
  const pageRef = useRef(page);
  const pendingRemote = useRef<TrackerState | null>(null);
  const shared = Boolean(remote);
  stateRef.current = state;
  editingRef.current = editing;
  pageRef.current = page;
  useEffect(() => {
    let cancelled = false;
    setState(null);
    void (
      shared
        ? remote!.load()
        : Promise.resolve().then(() => loadState(localStorage))
    )
      .then((value) => {
        if (!cancelled) {
          setState(value);
          setFatal("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState(null);
        setFatal(
          shared
            ? "Could not open shared storage. Check your connection and try again."
            : "Saved data could not be read. It has not been replaced. Download the saved data below before attempting recovery.",
        );
      });
    setPlayer("all");
    setEditing(undefined);
    return () => {
      cancelled = true;
    };
    // The parent keys this component by user and workspace; token refresh must not reload forms.
  }, [shared, remote]);
  useEffect(() => {
    if (shared) return;
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey)
        setMessage(
          "This tracker changed in another tab. Reload before editing.",
        );
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [shared]);
  useEffect(() => {
    if (!shared || !remote) return;
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;
    let queued = false;
    const refresh = async () => {
      timer = undefined;
      if (document.visibilityState === "hidden") return;
      if (saving.current) {
        timer = window.setTimeout(() => void refresh(), 500);
        return;
      }
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        const latest = await remote.load();
        if (cancelled || saving.current) return;
        const current = stateRef.current;
        if (current && latest.revision > current.revision) {
          if (
            editingRef.current !== undefined ||
            pageRef.current === "settings"
          ) {
            pendingRemote.current = latest;
            setMessage(
              "Your teammate saved changes. This view will sync when you finish the current draft.",
            );
          } else {
            setState(latest);
            setMessage("Live update applied.");
          }
        }
      } catch {
        if (!cancelled)
          setMessage(
            "Live sync is temporarily unavailable. It will retry when this tab becomes active.",
          );
      } finally {
        inFlight = false;
        if (queued && !cancelled) {
          queued = false;
          schedule(150);
        }
      }
    };
    const schedule = (delay = 150) => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), delay);
    };
    const unsubscribe = remote.subscribe(() => schedule());
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    const onFocus = () => schedule(0);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [shared, remote]);
  useEffect(() => {
    const latest = pendingRemote.current;
    if (editing === undefined && page !== "settings" && latest) {
      pendingRemote.current = null;
      setState((current) =>
        current && latest.revision > current.revision ? latest : current,
      );
      setMessage("Live update applied.");
    }
  }, [editing, page]);
  async function save(next: TrackerState) {
    if (!state) return;
    if (saving.current) throw new Error("A save is already in progress.");
    saving.current = true;
    try {
      const saved = shared
        ? await remote!.save({ ...next, revision: state.revision })
        : persistState(localStorage, next, state.revision);
      setState(saved);
      setMessage(
        shared ? "Saved to your shared tracker." : "Saved in this browser.",
      );
    } finally {
      saving.current = false;
    }
  }
  async function restore(backup: File) {
    try {
      if (backup.size > 20 * 1024 * 1024)
        throw new Error("Backup is too large (maximum 20 MB).");
      const incoming = parseBackup(await backup.text());
      if (
        !window.confirm(
          `Restore ${incoming.matches.length} matches in the tracker? This replaces its current records. Export a backup first if you want to keep them.`,
        )
      )
        return;
      if (state) await save(incoming);
      else
        throw new Error(
          "Download the unreadable saved data, then use browser storage recovery before restoring.",
        );
      setMessage("Backup restored.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not restore backup.");
    }
  }
  if (fatal)
    return (
      <main className="recovery panel">
        <h1>Let’s protect your saved data</h1>
        <p role="alert">{fatal}</p>
        {!shared && (
          <button
            onClick={() =>
              download(
                "mlbb-recovery.txt",
                localStorage.getItem(storageKey) ?? "",
                "text/plain",
              )
            }
          >
            Download saved data
          </button>
        )}
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  if (!state) return <main className="recovery">Opening your tracker…</main>;
  const rank = currentRank(state);
  const ranked = ordered(state.matches).filter(
    (match) => match.mode === "ranked",
  );
  const filtered = ranked.filter(
    (m) =>
      (player === "all" || m.playerId === player) &&
      (!from ||
        localInput(m.playedAt, state.push.timezone).slice(0, 10) >= from) &&
      (!to || localInput(m.playedAt, state.push.timezone).slice(0, 10) <= to),
  );
  const matches =
    page === "overview"
      ? ranked
      : windowSize === "all"
        ? filtered
        : filtered.slice(-Number(windowSize));
  const summary = stats(matches);
  const target = resolvedRankTarget(state);
  const targetProgress = rankTargetProgress(state);
  const progress = targetProgress?.percent ?? null;
  const chart = [
    ...(graphMode === "day"
      ? dailyProgression(state)
      : accountProgression(state)),
  ];
  const seasonProgress =
    state.push.startingRank && state.push.startingRank.tier !== "Mythic";
  const date = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: state.push.timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const primaryNav: Array<[Page, string, typeof LayoutDashboard]> = [
    ["overview", "Overview", LayoutDashboard],
    ["matches", "Match history", List],
    ["heroes", "Hero performance", Swords],
    ["lanes", "Lane performance", MapPinned],
  ];
  const secondaryNav: Array<[Page, string, typeof LayoutDashboard]> = [
    ["settings", "Settings", Settings2],
    ...(account
      ? ([["account", "Account", UserRound]] as Array<
          [Page, string, typeof LayoutDashboard]
        >)
      : []),
  ];
  const nav = [...primaryNav, ...secondaryNav];
  const renderNav = ([id, label, Icon]: (typeof nav)[number]) => (
    <button
      key={id}
      className={page === id ? "nav-item active" : "nav-item"}
      onClick={() => setPage(id)}
    >
      <Icon size={19} />
      {label}
      {page === id && <span className="active-dot" />}
    </button>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-icon">
            <Swords size={23} />
          </span>
          <span>
            push<span className="brand-light">together</span>
            <small>MLBB RANK TRACKER</small>
          </span>
        </a>
        <nav>
          <div className="nav-primary">{primaryNav.map(renderNav)}</div>
          <div className="nav-secondary">{secondaryNav.map(renderNav)}</div>
        </nav>
        <div className="sidebar-bottom">
          <span className="local-badge">
            <span /> {shared ? "Shared cloud storage" : "Saved on this browser"}
          </span>
        </div>
      </aside>
      <div className="workspace">
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "overview"
                  ? state.push.season || "CURRENT SEASON"
                  : state.push.name}
              </p>
              <h1>
                {page === "overview"
                  ? state.push.name
                  : nav.find((n) => n[0] === page)![1]}
              </h1>
            </div>
            {page !== "account" && (
              <div className="page-actions">
                <button className="primary" onClick={() => setEditing(null)}>
                  <Plus size={18} /> Record Ranked
                </button>
              </div>
            )}
          </div>
          {message && (
            <div className="notice" role="status">
              <Check size={18} />
              <span>{message}</span>
              <button className="text-button" onClick={() => setMessage("")}>
                Dismiss
              </button>
            </div>
          )}
          {page === "matches" && (
            <div className="filters">
              <PlayerScope value={player} onChange={setPlayer} />
              <select
                aria-label="Recent period"
                value={windowSize}
                onChange={(e) => setWindowSize(e.target.value)}
              >
                <option value="all">All time</option>
                <option value="10">Recent 10</option>
                <option value="20">Recent 20</option>
                <option value="50">Recent 50</option>
              </select>
              <label className="date-filter">
                From
                <input
                  aria-label="From date"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="date-filter">
                To
                <input
                  aria-label="To date"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <span className="filter-count">{matches.length} matches</span>
            </div>
          )}
          {page === "overview" && (
            <>
              <section className="summary-grid">
                <div className="rank-card">
                  <div className="rank-top">
                    <span className="eyebrow">SHARED ACCOUNT</span>
                    <span
                      className={`rank-emblem rank-${rank.display?.tone ?? "unknown"}`}
                      aria-hidden="true"
                    >
                      <ShieldCheck size={27} />
                    </span>
                  </div>
                  <p className="rank-tier">
                    {rank.display?.name ||
                      (rank.needsRankConfirmation
                        ? "Rank needs confirmation"
                        : "Choose starting rank in Settings")}
                  </p>
                  {rank.display?.division && (
                    <p className="rank-division">
                      Division {rank.display.division}
                    </p>
                  )}
                  <div className="star-total">
                    {rank.rankStars ??
                      (rank.incomplete || rank.needsRankConfirmation
                        ? "—"
                        : rank.stars)}
                    <span>stars</span>
                  </div>
                  <p className="rank-change">
                    {rank.incomplete
                      ? "Unknown change"
                      : signed(rank.stars - state.push.startingStars)}{" "}
                    from the starting {state.push.startingStars}
                  </p>
                  {seasonProgress && (
                    <p className="small">
                      Season star progress:{" "}
                      {rank.incomplete ? "unknown" : rank.stars}
                    </p>
                  )}
                  {rank.placementStatus === "pending" && (
                    <p className="small">
                      Placement pending · record the confirmed result after a
                      match before relying on this rank.
                    </p>
                  )}
                  {rank.display && (
                    <>
                      <div className="progress-track rank-progress">
                        <div style={{ width: `${rank.display.progress}%` }} />
                      </div>
                      <p className="rank-progress-label">
                        {rank.display.progressLabel}
                      </p>
                    </>
                  )}
                  <div className="rank-bottom">
                    <span>
                      {target === null
                        ? "Choose your next milestone"
                        : `Target: ${rankLabel(target)} · ${target.stars} stars`}
                    </span>
                    <button
                      onClick={() => setPage("settings")}
                      className="text-button"
                    >
                      {target === null ? "Set target" : "Edit target"}{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {targetProgress && (
                    <div className="target-progress">
                      <div className="progress-track">
                        <div style={{ width: `${progress ?? 0}%` }} />
                      </div>
                      <small>
                        {targetProgress.complete
                          ? "Rank target reached"
                          : `${targetProgress.remaining} rank stars remaining`}
                      </small>
                    </div>
                  )}
                  <small>
                    Last recorded:{" "}
                    {rank.at ? date(rank.at) : "starting baseline"}
                    {rank.incomplete ? " · incomplete star history" : ""}
                  </small>
                </div>
                <div className="stat-grid">
                  <div className="stat-card">
                    <span className="stat-icon">
                      <Gamepad2 size={20} />
                    </span>
                    <p>Games played</p>
                    <strong>{summary.games}</strong>
                    <small>
                      {summary.wins} wins · {summary.losses} losses
                    </small>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon">
                      <Star size={20} />
                    </span>
                    <p>W–L record</p>
                    <strong>
                      {summary.wins}W – {summary.losses}L
                    </strong>
                    <small>{percent(summary.winRate)} win rate</small>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon">
                      <Clock3 size={20} />
                    </span>
                    <p>Match time</p>
                    <strong>{duration(summary.seconds)}</strong>
                    <small>
                      {summary.durationCoverage}/{summary.games} durations
                      recorded
                    </small>
                  </div>
                </div>
              </section>
              <div className="middle-grid">
                <section className="panel progression">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">THE CLIMB</p>
                      <h2>Account progression</h2>
                    </div>
                    <div
                      className="graph-toggle"
                      role="group"
                      aria-label="Progression view"
                    >
                      <button
                        aria-pressed={graphMode === "day"}
                        onClick={() => setGraphMode("day")}
                      >
                        By day
                      </button>
                      <button
                        aria-pressed={graphMode === "game"}
                        onClick={() => setGraphMode("game")}
                      >
                        By game
                      </button>
                    </div>
                  </div>
                  <p className="muted small">
                    Shared account history · all ranked matches ·{" "}
                    {graphMode === "day"
                      ? state.push.timezone
                      : "unaffected by player filters"}
                  </p>
                  <div
                    className="chart"
                    role="img"
                    aria-label={`Account star history by ${graphMode}: ${chart.map((p) => `${p.label}: ${p.stars ?? "unknown"}`).join(", ")}`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chart}
                        margin={{ top: 20, right: 20, bottom: 10, left: -24 }}
                      >
                        <CartesianGrid stroke="#e9ece6" vertical={false} />
                        <XAxis
                          dataKey="label"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#828a80", fontSize: 12 }}
                          dy={10}
                        />
                        <YAxis
                          domain={["dataMin - 1", "dataMax + 1"]}
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#828a80", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #dde3d8",
                            fontSize: 13,
                          }}
                          formatter={(value) => [`${value} stars`, "Account"]}
                          labelFormatter={(_label, payload) =>
                            payload[0]?.payload
                              ? payload[0].payload.stars === null
                                ? `${payload[0].payload.label}: progress unavailable`
                                : `${payload[0].payload.label}: ${payload[0].payload.stars} stars · ${signed(payload[0].payload.delta)}${graphMode === "day" ? ` · ${payload[0].payload.games} games, ${payload[0].payload.wins}W/${payload[0].payload.losses}L` : ` · ${payload[0].payload.player}`}`
                              : "Account"
                          }
                        />
                        <Line
                          dataKey="stars"
                          type="stepAfter"
                          stroke="#558244"
                          strokeWidth={3}
                          dot={{
                            r: 4,
                            fill: "#558244",
                            stroke: "#fff",
                            strokeWidth: 2,
                          }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-footer">
                    <span>
                      <span className="player-dot p0" />{" "}
                      {seasonProgress
                        ? "Season star progress"
                        : "Account stars"}
                    </span>
                    <span>
                      {graphMode === "day" ? "Calendar day" : "Match sequence"}{" "}
                      →
                    </span>
                  </div>
                </section>
                <section className="panel players-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">THE TEAM</p>
                      <h2>Player contribution</h2>
                    </div>
                    <Users size={20} className="muted" />
                  </div>
                  {playerContributions(state, matches).map((s, i) => {
                    const p = s.player;
                    return (
                      <div className="player-summary" key={p.id}>
                        <div className={`player-avatar p${i % 3}`}>
                          {playerName(p.id).slice(0, 1)}
                        </div>
                        <div className="player-info">
                          <strong>{playerName(p.id)}</strong>
                          <span>
                            {s.games
                              ? `${s.games} games · ${percent(s.winRate)} win rate`
                              : "No matches in this view"}
                          </span>
                          {s.games > 0 && (
                            <span>
                              {s.durationCoverage
                                ? `${formatPlaytime(s.seconds)} ${s.durationCoverage === s.games ? "played" : "recorded"}`
                                : "Playtime not recorded"}
                            </span>
                          )}
                        </div>
                        <div className="player-stars">
                          <strong
                            className={s.knownNet < 0 ? "negative" : "positive"}
                          >
                            {s.starCoverage ? signed(s.net ?? s.knownNet) : "—"}
                          </strong>
                          <small>
                            {s.net === null && s.starCoverage
                              ? "known only"
                              : "stars"}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>
              <section className="panel history-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">LATEST ACTIVITY</p>
                    <h2>Recent matches</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage("matches")}
                  >
                    View all matches <ArrowUpRight size={16} />
                  </button>
                </div>
                <MatchHistory
                  state={state}
                  matches={matches.slice(-5)}
                  onEdit={setEditing}
                />
              </section>
            </>
          )}
          {page === "matches" && (
            <section className="panel history-panel">
              <div className="section-heading">
                <h2>Match log</h2>
                <span className="tag">Times in {state.push.timezone}</span>
              </div>
              <MatchHistory
                state={state}
                matches={matches}
                onEdit={setEditing}
              />
            </section>
          )}
          {page === "heroes" && (
            <PerformancePage
              kind="hero"
              state={state}
              matches={ranked}
              player={player}
              onPlayerChange={setPlayer}
            />
          )}
          {page === "lanes" && (
            <PerformancePage
              kind="position"
              state={state}
              matches={ranked}
              player={player}
              onPlayerChange={setPlayer}
            />
          )}
          {page === "settings" && (
            <Settings key={state.revision} state={state} onSave={save} />
          )}
          {page === "account" && account && <AccountPage account={account} />}
          <footer>
            <span>
              <ShieldCheck size={15} />{" "}
              {shared ? "Shared tracker" : "Local manual tracker"} ·{" "}
              {state.push.timezone}
            </span>
            <div>
              <button
                className="text-button"
                onClick={() =>
                  download("mlbb-backup.json", JSON.stringify(state, null, 2))
                }
              >
                <Download size={15} /> Export backup
              </button>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    "mlbb-matches.csv",
                    exportCsv(state),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                CSV
              </button>
              {page === "settings" && (
                <button
                  className="text-button"
                  onClick={() => file.current?.click()}
                >
                  <Upload size={15} /> Restore backup
                </button>
              )}
              {shared && page === "settings" && (
                <button
                  className="text-button"
                  onClick={() => {
                    try {
                      const raw = localStorage.getItem(storageKey);
                      if (raw === null)
                        setMessage(
                          "No older browser backup was found on this device.",
                        );
                      else download("mlbb-browser-recovery.json", raw);
                    } catch {
                      setMessage("Could not read this browser's saved data.");
                    }
                  }}
                >
                  Recover browser backup
                </button>
              )}
              <input
                type="file"
                accept=".json,application/json"
                ref={file}
                hidden
                onChange={(e) => {
                  const backup = e.target.files?.[0];
                  if (backup) void restore(backup);
                  e.target.value = "";
                }}
              />
            </div>
          </footer>
        </main>
      </div>
      {editing !== undefined && (
        <MatchForm
          state={state}
          match={editing}
          onSave={save}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
