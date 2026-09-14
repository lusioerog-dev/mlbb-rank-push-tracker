import { useState } from "react";
import type { FormEvent } from "react";
import { stateSchema } from "../../../packages/tracker/model";
import type { TrackerState } from "../../../packages/tracker/model";
import {
  archivedSeasons,
  startSeason,
} from "../../../packages/tracker/seasons";
import { playerName } from "../../../packages/tracker/players";
import {
  RANK_RULES,
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
        targetStars: get("targetStars") ? Number(get("targetStars")) : null,
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
                defaultValue={state.push.startingStars}
              />
            </label>
            <label>
              Target season star balance (optional)
              <input
                name="targetStars"
                type="number"
                min="0"
                max="1000000"
                defaultValue={state.push.targetStars ?? ""}
                placeholder="Set your own target"
              />
            </label>
            <label>
              Season starting rank
              <select
                disabled={baselineLocked}
                value={startTier}
                onChange={(e) =>
                  setStartTier(e.target.value as StartingRank["tier"] | "")
                }
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
                  defaultValue={
                    state.push.startingRank?.tier === startTier
                      ? (state.push.startingRank.division ??
                        RANK_RULES.divisions[startTier].count)
                      : RANK_RULES.divisions[startTier].count
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
