import { useState } from "react";
import type { FormEvent } from "react";
import {
  currentRank,
  resolvedRankTarget,
  stateSchema,
} from "../../../packages/tracker/model";
import type { TrackerState } from "../../../packages/tracker/model";
import {
  archivedSeasons,
  startSeason,
} from "../../../packages/tracker/seasons";
import { playerName } from "../../../packages/tracker/players";
import {
  RANK_RULES,
  getSeasonResetSuggestion,
  rankLabel,
  rankTiers,
  type StartingRank,
} from "../../../packages/tracker/rank-rules";

export function Settings({
  state,
  onSave,
}: {
  state: TrackerState;
  onSave: (state: TrackerState) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [newSeason, setNewSeason] = useState(false);
  const [correctBaseline, setCorrectBaseline] = useState(false);
  const baselineLocked =
    state.matches.length > 0 && !newSeason && !correctBaseline;
  const [startTier, setStartTier] = useState<StartingRank["tier"] | "">(
    state.push.startingRank?.tier ?? "",
  );
  const [startDivision, setStartDivision] = useState(
    state.push.startingRank?.division ?? 1,
  );
  const [startStars, setStartStars] = useState(state.push.startingStars);
  const endingRank = currentRank(state).position;
  const resetSuggestion = endingRank
    ? getSeasonResetSuggestion(endingRank)
    : null;
  const existingTarget = resolvedRankTarget(state);
  const [targetTier, setTargetTier] = useState<StartingRank["tier"] | "">(
    existingTarget?.tier ?? "",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const data = new FormData(event.currentTarget);
      const get = (key: string) => String(data.get(key) ?? "").trim();
      const push = {
        name: get("name"),
        season: get("season"),
        timezone: get("timezone"),
        rankTier: state.push.rankTier,
        ...(baselineLocked
          ? { startingRank: state.push.startingRank }
          : startTier
            ? {
                startingRank: {
                  tier: startTier,
                  division:
                    startTier === "Mythic" ? null : Number(get("division")),
                  rulesVersion: RANK_RULES.version,
                },
              }
            : {}),
        startingStars: baselineLocked
          ? state.push.startingStars
          : Number(get("startingStars")),
        targetStars:
          targetTier === "Mythic"
            ? Number(get("targetRankStars"))
            : targetTier
              ? null
              : state.push.targetRank === undefined
                ? state.push.targetStars
                : null,
        targetRank: targetTier
          ? {
              tier: targetTier,
              division:
                targetTier === "Mythic" ? null : Number(get("targetDivision")),
              stars: Number(get("targetRankStars")),
              rulesVersion: RANK_RULES.version,
            }
          : null,
      };
      if (correctBaseline && !newSeason && !get("reason"))
        throw new Error("Give a reason for correcting the starting rank.");
      if (newSeason && get("confirmSeason") !== "on")
        throw new Error(
          "Confirm the new season's starting rank before continuing.",
        );
      const next = newSeason
        ? startSeason(state, push)
        : stateSchema.parse({
            ...state,
            push,
            audit: [
              ...state.audit,
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                action: "settings",
                note: correctBaseline
                  ? `Starting rank correction: ${get("reason")}`.slice(0, 300)
                  : "Updated push settings.",
                before: { push: state.push, players: state.players },
              },
            ],
          });
      await onSave(next);
      setNewSeason(false);
      setCorrectBaseline(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Season settings</h2>
        <label>
          Action
          <select
            value={newSeason ? "new" : "edit"}
            onChange={(e) => {
              setNewSeason(e.target.value === "new");
              setStartTier(state.push.startingRank?.tier ?? "");
              setStartDivision(state.push.startingRank?.division ?? 1);
              setStartStars(state.push.startingStars);
              setError("");
            }}
          >
            <option value="edit">Update current season</option>
            <option value="new">Archive and start a new season</option>
          </select>
        </label>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Push name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={state.push.name}
              />
            </label>
            <label>
              Season
              <input
                name="season"
                required={newSeason}
                maxLength={80}
                defaultValue={state.push.season}
                placeholder="e.g. Season 42"
              />
            </label>
            <label>
              Starting stars
              <input
                name="startingStars"
                disabled={baselineLocked}
                type="number"
                min="0"
                max="1000000"
                required
                value={startStars}
                onChange={(event) => setStartStars(Number(event.target.value))}
              />
            </label>
            <label>
              Target rank <span className="muted">optional</span>
              <select
                value={targetTier}
                onChange={(event) =>
                  setTargetTier(event.target.value as StartingRank["tier"] | "")
                }
              >
                <option value="">No rank target</option>
                {rankTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            {targetTier && targetTier !== "Mythic" && (
              <label>
                Target division
                <select
                  key={targetTier}
                  name="targetDivision"
                  defaultValue={
                    existingTarget?.tier === targetTier
                      ? (existingTarget.division ?? 1)
                      : 1
                  }
                >
                  {Array.from(
                    { length: RANK_RULES.divisions[targetTier].count },
                    (_, index) => index + 1,
                  ).map((division) => (
                    <option key={division} value={division}>
                      {["", "I", "II", "III", "IV", "V"][division]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {targetTier && (
              <label>
                {targetTier === "Mythic"
                  ? "Target Mythic stars"
                  : "Target division stars"}
                <input
                  name="targetRankStars"
                  type="number"
                  min="0"
                  max={
                    targetTier === "Mythic"
                      ? 1000000
                      : RANK_RULES.divisions[targetTier].stars
                  }
                  required
                  defaultValue={
                    existingTarget?.tier === targetTier
                      ? existingTarget.stars
                      : 0
                  }
                />
              </label>
            )}
            <label>
              Season starting rank
              <select
                disabled={baselineLocked}
                value={startTier}
                onChange={(e) => {
                  const tier = e.target.value as StartingRank["tier"] | "";
                  setStartTier(tier);
                  if (tier && tier !== "Mythic")
                    setStartDivision(RANK_RULES.divisions[tier].count);
                }}
              >
                <option value="">Choose once from in-game rank</option>
                {rankTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier === "Mythic"
                      ? "Mythic and above (use total Mythic stars)"
                      : tier}
                  </option>
                ))}
              </select>
            </label>
            {startTier && startTier !== "Mythic" && (
              <label>
                Starting division
                <select
                  key={startTier}
                  name="division"
                  disabled={baselineLocked}
                  value={startDivision}
                  onChange={(event) =>
                    setStartDivision(Number(event.target.value))
                  }
                >
                  {Array.from(
                    { length: RANK_RULES.divisions[startTier].count },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {["", "I", "II", "III", "IV", "V"][n]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Timezone
              <input
                name="timezone"
                required
                defaultValue={state.push.timezone}
                placeholder="Asia/Kathmandu"
              />
            </label>
          </div>
          {newSeason && resetSuggestion && (
            <div className="season-reset-suggestion">
              <p>
                Observed Season 41→42 reset suggestion:{" "}
                <strong>{rankLabel(resetSuggestion)}</strong>, 0 stars. Confirm
                this against the in-game rank screen before saving.
              </p>
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setStartTier(resetSuggestion.tier);
                  setStartDivision(resetSuggestion.division ?? 1);
                  setStartStars(resetSuggestion.stars);
                }}
              >
                Use as starting draft
              </button>
            </div>
          )}
          {newSeason ? (
            <label className="season-confirm">
              <input type="checkbox" name="confirmSeason" required />I checked
              the new starting rank and stars in-game. Keep the current season
              in history and start an empty match log.
            </label>
          ) : state.matches.length > 0 ? (
            <>
              <label className="season-confirm">
                <input
                  type="checkbox"
                  checked={correctBaseline}
                  onChange={(e) => setCorrectBaseline(e.target.checked)}
                />
                Correct the starting rank (recalculates this season)
              </label>
              {correctBaseline && (
                <label>
                  Reason for correction
                  <input name="reason" required maxLength={260} />
                </label>
              )}
            </>
          ) : (
            <p className="small muted">
              Enter the starting rank and stars shown in-game before recording
              matches.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : newSeason
                ? "Archive and start season"
                : "Save settings"}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Your backups and history</h2>
        <p>
          Use <strong>Export backup</strong> regularly. The JSON backup includes
          players, heroes, settings, matches and the correction history. CSV
          exports match rows for spreadsheets.
        </p>
        <h3>Past seasons</h3>
        {archivedSeasons(state)
          .reverse()
          .map((archive) => (
            <details key={archive.id}>
              <summary>
                {archive.state.push.season || archive.state.push.name} ·{" "}
                {archive.state.matches.length} matches
              </summary>
              <p className="small muted">
                Archived {new Date(archive.at).toLocaleDateString("en-GB")} ·
                included in your full JSON backup.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Played</th>
                      <th>Player</th>
                      <th>Hero</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.state.matches.map((match) => (
                      <tr key={match.id}>
                        <td>
                          {new Date(match.playedAt).toLocaleString("en-GB", {
                            timeZone: archive.state.push.timezone,
                          })}
                        </td>
                        <td>{playerName(match.playerId)}</td>
                        <td>
                          {archive.state.heroes.find(
                            (hero) => hero.id === match.heroId,
                          )?.name ?? "—"}
                        </td>
                        <td>{match.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        {!archivedSeasons(state).length && (
          <p className="muted">
            Your previous season will appear here when you start a new one.
          </p>
        )}
        <hr />
        <h3>Recorded corrections</h3>
        <p className="muted">
          Original values are kept whenever a match is edited.
        </p>
        <div className="audit-list">
          {[...state.audit]
            .reverse()
            .slice(0, 20)
            .map((a) => (
              <div key={a.id}>
                <strong>{a.note}</strong>
                <span>
                  {new Date(a.at).toLocaleString("en-GB", {
                    timeZone: state.push.timezone,
                  })}
                </span>
              </div>
            ))}
          {!state.audit.length && <p className="muted">No corrections yet.</p>}
        </div>
      </section>
    </div>
  );
}
