import { ChevronRight, Gamepad2 } from "lucide-react";
import type { Match, TrackerState } from "../../../packages/tracker/model";
import { starChange } from "../../../packages/tracker/model";
import { playerName } from "../../../packages/tracker/players";
import { rankLabel } from "../../../packages/tracker/rank-rules";

const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value}★`;
const clock = (seconds: number | null) =>
  seconds === null
    ? "—"
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const positionLabel = (position: Match["playedPosition"]) =>
  position
    ? {
        exp_lane: "EXP",
        gold_lane: "Gold",
        mid_lane: "Mid",
        roam: "Roam",
        jungle: "Jungle",
      }[position]
    : null;

export function MatchHistory({
  state,
  matches,
  onEdit,
}: {
  state: TrackerState;
  matches: Match[];
  onEdit: (match: Match) => void;
}) {
  const date = (iso: string, detailed = false) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: state.push.timezone,
      month: "short",
      day: "numeric",
      ...(detailed
        ? { year: "numeric", hour: "2-digit", minute: "2-digit" }
        : {}),
    });
  if (!matches.length)
    return (
      <div className="empty compact-empty">
        <Gamepad2 />
        <h3>No matches in this view</h3>
      </div>
    );
  return (
    <div className="match-list">
      {[...matches].reverse().map((match) => {
        const hero = state.heroes.find((item) => item.id === match.heroId);
        const change = starChange(match);
        const hasKda = [match.kills, match.deaths, match.assists].some(
          (value) => value !== null,
        );
        return (
          <details className={`match-row ${match.result}`} key={match.id}>
            <summary>
              <span className="match-result">
                {match.result === "win"
                  ? "Victory"
                  : match.result === "loss"
                    ? "Defeat"
                    : match.result}
              </span>
              <span className="match-player">{playerName(match.playerId)}</span>
              <span className="match-hero">
                <span className="hero-mark">
                  {(hero?.name ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{hero?.name ?? "Hero unavailable"}</strong>
                  <small>
                    {positionLabel(match.playedPosition) ??
                      date(match.playedAt)}
                  </small>
                </span>
              </span>
              <span className="match-kda">
                {hasKda
                  ? [match.kills, match.deaths, match.assists]
                      .map((value) => value ?? "—")
                      .join(" / ")
                  : "—"}
              </span>
              <span className="match-duration">
                {clock(match.durationSeconds)}
              </span>
              <strong
                className={
                  change !== null && change > 0
                    ? "positive"
                    : change !== null && change < 0
                      ? "negative"
                      : ""
                }
              >
                {signed(change)}
              </strong>
              <ChevronRight className="match-chevron" size={17} />
            </summary>
            <div className="match-details">
              <div>
                <span>Played</span>
                <strong>{date(match.playedAt, true)}</strong>
              </div>
              {match.battleId && (
                <div>
                  <span>Battle ID</span>
                  <strong>{match.battleId}</strong>
                </div>
              )}
              {match.starsBefore !== null && match.starsAfter !== null && (
                <div>
                  <span>Stars</span>
                  <strong>
                    {match.starsBefore} → {match.starsAfter}
                  </strong>
                </div>
              )}
              {match.rankCheckpoint && (
                <div>
                  <span>Confirmed rank</span>
                  <strong>{rankLabel(match.rankCheckpoint.position)}</strong>
                </div>
              )}
              <div>
                <span>Source</span>
                <strong>
                  {match.source === "screenshot_review"
                    ? "Screenshot review"
                    : "Manual"}
                </strong>
              </div>
              {match.notes && (
                <div className="match-notes">
                  <span>Notes</span>
                  <strong>{match.notes}</strong>
                </div>
              )}
              <button className="text-button" onClick={() => onEdit(match)}>
                Edit match
              </button>
            </div>
          </details>
        );
      })}
    </div>
  );
}
