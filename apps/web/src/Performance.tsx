import {
  Coins,
  Footprints,
  Gem,
  Shield,
  Sparkles,
  Swords,
  Trees,
} from "lucide-react";
import type {
  Match,
  PlayedPosition,
  TrackerState,
} from "../../../packages/tracker/model";
import {
  heroPerformance,
  positionPerformance,
} from "../../../packages/tracker/model";
import { PlayerScope } from "./PlayerScope";

const percentage = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const kda = (value: number | null) => (value === null ? "—" : value.toFixed(2));

const positionDetails: Record<
  NonNullable<PlayedPosition>,
  { label: string; Icon: typeof Swords }
> = {
  gold_lane: { label: "Gold", Icon: Coins },
  exp_lane: { label: "EXP", Icon: Shield },
  mid_lane: { label: "Mid", Icon: Sparkles },
  jungle: { label: "Jungle", Icon: Trees },
  roam: { label: "Roam", Icon: Footprints },
};

function PerformanceTable({
  rows,
  kind,
}: {
  rows: Array<{
    id: string;
    label: string;
    games: number;
    wins: number;
    losses: number;
    winRate: number | null;
    averageKda: number | null;
    Icon?: typeof Swords;
  }>;
  kind: "hero" | "position";
}) {
  if (!rows.length)
    return (
      <div className="empty compact-empty">
        {kind === "hero" ? <Swords /> : <Gem />}
        <h3>No {kind === "hero" ? "hero" : "position"} data yet</h3>
        <p>Add it when recording or correcting a match.</p>
      </div>
    );
  return (
    <div className="performance-list" role="table">
      <div className="performance-head" role="row">
        <span>{kind === "hero" ? "Hero" : "Position"}</span>
        <span>Games</span>
        <span>W–L</span>
        <span>Win rate</span>
        <span>Avg KDA</span>
      </div>
      {rows.map((row) => {
        const Icon = row.Icon;
        return (
          <div className="performance-row" role="row" key={row.id}>
            <div className="performance-identity" role="cell">
              <span className={`performance-icon ${kind}`}>
                {Icon ? (
                  <Icon size={18} />
                ) : (
                  row.label.slice(0, 2).toUpperCase()
                )}
              </span>
              <strong>{row.label}</strong>
            </div>
            <span role="cell" data-label="Games">
              {row.games}
            </span>
            <span role="cell" data-label="W–L">
              {row.wins}–{row.losses}
            </span>
            <strong role="cell" data-label="Win rate">
              {percentage(row.winRate)}
            </strong>
            <span role="cell" data-label="Avg KDA">
              {kda(row.averageKda)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PerformancePage({
  kind,
  state,
  matches,
  player,
  onPlayerChange,
}: {
  kind: "hero" | "position";
  state: TrackerState;
  matches: Match[];
  player: string;
  onPlayerChange: (value: string) => void;
}) {
  const scoped = matches.filter(
    (match) => player === "all" || match.playerId === player,
  );
  const rows =
    kind === "hero"
      ? heroPerformance(state, scoped).map((row) => ({
          id: row.hero.id,
          label: row.hero.name,
          ...row,
        }))
      : positionPerformance(scoped).map((row) => ({
          id: row.position,
          label: positionDetails[row.position]!.label,
          Icon: positionDetails[row.position]!.Icon,
          ...row,
        }));
  return (
    <section className="panel performance-panel">
      <div className="performance-toolbar">
        <PlayerScope value={player} onChange={onPlayerChange} />
        <span>{scoped.length} ranked matches</span>
      </div>
      <PerformanceTable rows={rows} kind={kind} />
    </section>
  );
}
