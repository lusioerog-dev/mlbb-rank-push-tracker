import { useState } from "react";
import type { FormEvent } from "react";
import { stateSchema } from "../../../packages/tracker/model";
import type { TrackerState } from "../../../packages/tracker/model";
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
  const [startTier, setStartTier] = useState<StartingRank["tier"] | "">(
    state.push.startingRank?.tier ?? "",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    try {
      const data = new FormData(event.currentTarget);
      const get = (key: string) => String(data.get(key) ?? "").trim();
      const players = state.players.map((p) => ({ ...p, name: get(p.id) }));
      if (get("newPlayer"))
        players.push({ id: crypto.randomUUID(), name: get("newPlayer") });
      const push = {
        name: get("name"),
        season: get("season"),
        timezone: get("timezone"),
        rankTier: state.push.rankTier,
        ...(startTier
          ? {
              startingRank: {
                tier: startTier,
                division:
                  startTier === "Mythic" ? null : Number(get("division")),
                rulesVersion: RANK_RULES.version,
              },
            }
          : {}),
        startingStars: Number(get("startingStars")),
        targetStars: get("targetStars") ? Number(get("targetStars")) : null,
      };
      const next = stateSchema.parse({
        ...state,
        players,
        push,
        audit: [
          ...state.audit,
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            action: "settings",
            note: "Updated push settings or player names.",
            before: { push: state.push, players: state.players },
          },
        ],
      });
      await onSave(next);
      setError("");
      form.querySelector<HTMLInputElement>('[name="newPlayer"]')!.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h2>Push settings</h2>
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
                maxLength={80}
                defaultValue={state.push.season}
                placeholder="Optional"
              />
            </label>
            <label>
              Starting stars
              <input
                name="startingStars"
                type="number"
                min="0"
                max="1000000"
                required
                defaultValue={state.push.startingStars}
              />
            </label>
            <label>
              Target stars
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
          <p className="small muted">
            Select the rank and stars shown in-game at the start of this tracked
            season. The current reset mapping is not verified, so no reset is
            guessed. Changing this baseline recalculates all matches in this
            tracker; use a new shared season to preserve the previous season
            separately.
          </p>
          <fieldset>
            <legend>Players</legend>
            <div className="form-grid">
              {state.players.map((p) => (
                <label key={p.id}>
                  Display name
                  <input
                    name={p.id}
                    required
                    maxLength={80}
                    defaultValue={p.name}
                  />
                </label>
              ))}
              <label>
                Add another player
                <input
                  name="newPlayer"
                  maxLength={80}
                  placeholder="Optional display name"
                />
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={pending}>
            Save settings
          </button>
        </form>
      </section>
      <section className="panel">
        <p className="eyebrow">YOUR DATA</p>
        <h2>Your backups and history</h2>
        <p>
          Shared trackers save online. Personal browser records stay on this
          device. Check the storage label before recording matches.
        </p>
        <p>
          Use <strong>Export backup</strong> regularly. The JSON backup includes
          players, heroes, settings, matches and the correction history. CSV
          exports match rows for spreadsheets.
        </p>
        <p>
          Export before restoring a backup: restore replaces the selected
          tracker's records. Refresh a shared tracker to see your teammate's
          latest saves.
        </p>
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
