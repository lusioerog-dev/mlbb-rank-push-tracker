import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Flag,
  Gamepad2,
  LayoutDashboard,
  List,
  Plus,
  Settings2,
  ShieldCheck,
  Star,
  Swords,
  Trophy,
  Upload,
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
import type {
  Dataset,
  Match,
  TrackerState,
} from "../../../packages/tracker/model";
import {
  currentRank,
  heroStats,
  ordered,
  starChange,
  stats,
} from "../../../packages/tracker/model";
import {
  exportCsv,
  loadState,
  parseBackup,
  persistState,
  storageKey,
} from "../../../packages/tracker/storage";
import { localInput } from "../../../packages/tracker/time";
import { MatchForm } from "./MatchForm";
import { Settings } from "./Settings";

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
type Page = "overview" | "matches" | "heroes" | "settings";
export function App() {
  const [dataset, setDataset] = useState<Dataset>("real");
  const [state, setState] = useState<TrackerState | null>(null);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("overview");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Match | null | undefined>(undefined);
  const [player, setPlayer] = useState("all");
  const [mode, setMode] = useState("ranked");
  const [windowSize, setWindowSize] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      setState(loadState(localStorage, dataset));
      setFatal("");
    } catch {
      setState(null);
      setFatal(
        "Saved data could not be read. It has not been replaced. Download the saved data below before attempting recovery.",
      );
    }
    setPlayer("all");
    setEditing(undefined);
  }, [dataset]);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey(dataset))
        setMessage(
          "This tracker changed in another tab. Reload before editing.",
        );
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [dataset]);
  function save(next: TrackerState) {
    if (!state) return;
    const saved = persistState(localStorage, next, state.revision);
    setState(saved);
    setMessage("Saved in this browser.");
  }
  async function restore(backup: File) {
    try {
      if (backup.size > 20 * 1024 * 1024)
        throw new Error("Backup is too large (maximum 20 MB).");
      const incoming = parseBackup(await backup.text(), dataset);
      if (
        !window.confirm(
          `Restore ${incoming.matches.length} matches in the ${dataset} tracker? This replaces its current records. Export a backup first if you want to keep them.`,
        )
      )
        return;
      if (state) save(incoming);
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
        <button
          onClick={() =>
            download(
              "mlbb-recovery.txt",
              localStorage.getItem(storageKey(dataset)) ?? "",
              "text/plain",
            )
          }
        >
          Download saved data
        </button>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  if (!state) return <main className="recovery">Opening your tracker…</main>;
  const rank = currentRank(state);
  const filtered = ordered(state.matches).filter(
    (m) =>
      (player === "all" || m.playerId === player) &&
      (mode === "all" || m.mode === mode) &&
      (!from ||
        localInput(m.playedAt, state.push.timezone).slice(0, 10) >= from) &&
      (!to || localInput(m.playedAt, state.push.timezone).slice(0, 10) <= to),
  );
  const matches =
    windowSize === "all" ? filtered : filtered.slice(-Number(windowSize));
  const summary = stats(matches);
  const target = state.push.targetStars;
  const progress =
    target !== null && target > state.push.startingStars
      ? Math.min(
          100,
          Math.max(
            0,
            ((rank.stars - state.push.startingStars) /
              (target - state.push.startingStars)) *
              100,
          ),
        )
      : null;
  const rankMatches = ordered(state.matches).filter((m) => m.mode === "ranked");
  const chart = [
    {
      label: "Start",
      stars: state.push.startingStars as number | null,
      player: "Account baseline",
    },
    ...rankMatches.map((m, i) => ({
      label: `${i + 1}`,
      stars: m.starsAfter,
      player: state.players.find((p) => p.id === m.playerId)!.name,
    })),
  ];
  const date = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: state.push.timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const nav: Array<[Page, string, typeof LayoutDashboard]> = [
    ["overview", "Overview", LayoutDashboard],
    ["matches", "Match history", List],
    ["heroes", "Hero performance", Swords],
    ["settings", "Settings", Settings2],
  ];
  const renderHistory = (rows: Match[]) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Match / time</th>
            <th>Player</th>
            <th>Hero</th>
            <th>K / D / A</th>
            <th>Duration</th>
            <th>Stars</th>
            <th>
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((m) => (
            <tr key={m.id}>
              <td>
                <span className={`result ${m.result}`}>
                  {m.result === "win"
                    ? "Victory"
                    : m.result === "loss"
                      ? "Defeat"
                      : m.result}
                </span>
                <small>
                  {date(m.playedAt)} · {m.mode}
                </small>
              </td>
              <td>
                <span
                  className={`player-dot p${state.players.findIndex((p) => p.id === m.playerId) % 3}`}
                />
                {state.players.find((p) => p.id === m.playerId)?.name}
              </td>
              <td>
                {state.heroes.find((h) => h.id === m.heroId)?.name ?? (
                  <span className="muted">Not recorded</span>
                )}
              </td>
              <td className="mono">
                {[m.kills, m.deaths, m.assists]
                  .map((n) => n ?? "—")
                  .join(" / ")}
              </td>
              <td className="mono">
                {m.durationSeconds === null
                  ? "—"
                  : `${Math.floor(m.durationSeconds / 60)}:${String(m.durationSeconds % 60).padStart(2, "0")}`}
              </td>
              <td>
                <strong
                  className={
                    starChange(m) !== null && starChange(m)! > 0
                      ? "positive"
                      : starChange(m) !== null && starChange(m)! < 0
                        ? "negative"
                        : ""
                  }
                >
                  {signed(starChange(m))}
                </strong>
                <small>
                  {m.starsBefore ?? "?"} → {m.starsAfter ?? "?"}
                </small>
              </td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => setEditing(m)}
                  aria-label={`Edit match ${date(m.playedAt)}`}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <Gamepad2 />
          <h3>No matches in this view</h3>
          <p>Record a match or adjust your filters.</p>
        </div>
      )}
    </div>
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
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              {label}
              {page === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shared-mark">
            <Users size={20} />
            <div>
              One account.
              <br />
              <strong>A shared climb.</strong>
            </div>
          </div>
          <p>
            Every match has a player.
            <br />
            Every star belongs to the account.
          </p>
          <span className="local-badge">
            <span /> Saved on this browser
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>{nav.find((n) => n[0] === page)![1]}</strong>
          </span>
          <div className="top-actions">
            <select
              aria-label="Tracker dataset"
              className="dataset"
              value={dataset}
              onChange={(e) => {
                if (e.target.value === dataset) return;
                setState(null);
                setDataset(e.target.value as Dataset);
                setMessage("");
              }}
            >
              <option value="real">Real tracker</option>
              <option value="demo">Demo tracker</option>
            </select>
            <span className="avatar">{state.players[0]!.name.slice(0, 1)}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {state.dataset === "demo"
                  ? "PRACTICE SPACE · INVENTED PLAYER ASSIGNMENTS"
                  : "ONE ACCOUNT · EVERY CONTRIBUTION COUNTS"}
              </p>
              <h1>
                {page === "overview"
                  ? state.push.name
                  : nav.find((n) => n[0] === page)![1]}
              </h1>
              <p className="muted">
                {page === "overview"
                  ? "Your progress, one match at a time."
                  : page === "matches"
                    ? "The details behind every step of the climb."
                    : page === "heroes"
                      ? "Find what works for each player."
                      : "Your players, your target, your data."}
              </p>
            </div>
            <button className="primary" onClick={() => setEditing(null)}>
              <Plus size={18} /> Record match
            </button>
          </div>
          {dataset === "demo" && (
            <div className="notice demo">
              <Flag size={18} />
              <span>
                Demo data. Player assignments are invented for testing and do
                not affect the real tracker.
              </span>
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              <Check size={18} />
              <span>{message}</span>
              <button className="text-button" onClick={() => setMessage("")}>
                Dismiss
              </button>
            </div>
          )}
          {page !== "settings" && (
            <div className="filters">
              <label>
                <span className="sr-only">Player</span>
                <select
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                >
                  <option value="all">All players</option>
                  {state.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <select
                aria-label="Mode filter"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="ranked">Ranked matches</option>
                <option value="all">All modes</option>
                <option value="classic">Classic</option>
              </select>
              <select
                aria-label="Recent period"
                value={windowSize}
                onChange={(e) => setWindowSize(e.target.value)}
              >
                <option value="all">All matches</option>
                <option value="10">Last 10</option>
                <option value="20">Last 20</option>
                <option value="50">Last 50</option>
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
                    <span className="rank-emblem">
                      <Star size={24} />
                    </span>
                  </div>
                  <p className="rank-tier">
                    {rank.tier || "Rank tier not yet recorded"}
                  </p>
                  <div className="star-total">
                    {rank.stars}
                    <span>stars</span>
                  </div>
                  <p className="rank-change">
                    {signed(rank.stars - state.push.startingStars)} from the
                    starting {state.push.startingStars}
                  </p>
                  <div className="progress-track">
                    <div style={{ width: `${progress ?? 0}%` }} />
                  </div>
                  <div className="rank-bottom">
                    <span>
                      {target === null
                        ? "Choose your next milestone"
                        : `Target: ${target} stars`}
                    </span>
                    <button
                      onClick={() => setPage("settings")}
                      className="text-button"
                    >
                      {target === null ? "Set target" : "Edit target"}{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <small>
                    Last recorded:{" "}
                    {rank.at ? date(rank.at) : "starting baseline"}
                    {rank.incomplete ? " · newer match has unknown stars" : ""}
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
                      <Trophy size={20} />
                    </span>
                    <p>Win rate</p>
                    <strong>{percent(summary.winRate)}</strong>
                    <small>Wins ÷ decided games</small>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon">
                      <Star size={20} />
                    </span>
                    <p>Net stars</p>
                    <strong className="positive">{signed(summary.net)}</strong>
                    <small>
                      {summary.starCoverage}/{summary.games} matches with known
                      change
                    </small>
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
                    <span className="tag">All ranked matches</span>
                  </div>
                  <p className="muted small">
                    Shared account history · unaffected by player filters
                  </p>
                  <div
                    className="chart"
                    role="img"
                    aria-label={`Account star history: ${chart.map((p) => `${p.label}: ${p.stars ?? "unknown"}`).join(", ")}`}
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
                            payload[0]?.payload?.player ?? "Account"
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
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-footer">
                    <span>
                      <span className="player-dot p0" /> Recorded account stars
                    </span>
                    <span>Match sequence →</span>
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
                  {state.players.map((p, i) => {
                    const s = stats(matches.filter((m) => m.playerId === p.id));
                    return (
                      <div className="player-summary" key={p.id}>
                        <div className={`player-avatar p${i % 3}`}>
                          {p.name.slice(0, 1)}
                        </div>
                        <div className="player-info">
                          <strong>{p.name}</strong>
                          <span>
                            {s.games
                              ? `${s.games} games · ${percent(s.winRate)} win rate`
                              : "No matches in this view"}
                          </span>
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
                  <div className="tip">
                    <ShieldCheck size={21} />
                    <p>
                      Players take turns.
                      <br />
                      The account’s stars carry forward.
                    </p>
                  </div>
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
                {renderHistory(matches.slice(-5))}
              </section>
            </>
          )}
          {page === "matches" && (
            <section className="panel history-panel">
              <div className="section-heading">
                <h2>Match log</h2>
                <span className="tag">Times in {state.push.timezone}</span>
              </div>
              {renderHistory(matches)}
            </section>
          )}
          {page === "heroes" && (
            <section className="panel">
              <div className="section-heading">
                <h2>Player × hero</h2>
                <span className="tag">
                  {matches.filter((m) => m.heroId !== null).length}/
                  {matches.length} heroes recorded
                </span>
              </div>
              <p className="muted">
                Hero names from the screenshots await confirmation. Edit a match
                to add its hero; performance will appear here.
              </p>
              {heroStats(state, matches).length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Hero</th>
                        <th>Player</th>
                        <th>Games</th>
                        <th>Win rate</th>
                        <th>Net stars</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heroStats(state, matches).map((h) => (
                        <tr key={`${h.player.id}-${h.hero.id}`}>
                          <td>
                            <strong>{h.hero.name}</strong>
                          </td>
                          <td>{h.player.name}</td>
                          <td>{h.games}</td>
                          <td>{percent(h.winRate)}</td>
                          <td>{signed(h.net)}</td>
                          <td>
                            {h.durationCoverage ? duration(h.seconds) : "—"}
                            <small>
                              {h.durationCoverage}/{h.games} recorded
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Swords />
                  <h3>Give each match a hero</h3>
                  <p>Your first confirmed hero is all it takes to start.</p>
                  <button onClick={() => setPage("matches")}>
                    Open match history
                  </button>
                </div>
              )}
            </section>
          )}
          {page === "settings" && (
            <Settings
              key={`${dataset}-${state.players.length}`}
              state={state}
              onSave={save}
            />
          )}
          <footer>
            <span>
              <ShieldCheck size={15} /> Local manual tracker ·{" "}
              {state.push.timezone}
            </span>
            <div>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    `mlbb-${dataset}-backup.json`,
                    JSON.stringify(state, null, 2),
                  )
                }
              >
                <Download size={15} /> Export backup
              </button>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    `mlbb-${dataset}-matches.csv`,
                    exportCsv(state),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                CSV
              </button>
              <button
                className="text-button"
                onClick={() => file.current?.click()}
              >
                <Upload size={15} /> Restore backup
              </button>
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
