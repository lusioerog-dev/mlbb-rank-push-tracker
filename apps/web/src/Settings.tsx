import { useState } from "react";
import type { FormEvent } from "react";
import { stateSchema } from "../../../packages/tracker/model";
import type { TrackerState } from "../../../packages/tracker/model";

export function Settings({
  state,
  onSave,
}: {
  state: TrackerState;
  onSave: (state: TrackerState) => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        rankTier: get("rankTier"),
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
      onSave(next);
      setError("");
      event.currentTarget.querySelector<HTMLInputElement>(
        '[name="newPlayer"]',
      )!.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
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
              Starting rank tier
              <input
                name="rankTier"
                maxLength={80}
                defaultValue={state.push.rankTier}
                placeholder="Not yet confirmed"
              />
            </label>
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
            This version compares stars within one tier. For tier transitions,
            leave match stars blank and record both ranks in notes. Multiple
            pushes and tier conversion come later.
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
          <button className="primary" type="submit">
            Save settings
          </button>
        </form>
      </section>
      <section className="panel">
        <p className="eyebrow">YOUR DATA</p>
        <h2>Local, with an exit door</h2>
        <p>
          This version saves in this browser. It does not sync between your
          phone and Gaurav’s phone yet.
        </p>
        <p>
          Use <strong>Export backup</strong> regularly. The JSON backup includes
          players, heroes, settings, matches and the correction history. CSV
          exports match rows for spreadsheets.
        </p>
        <p>
          Clearing browser storage or changing browsers can remove access to
          these records. Restore a JSON backup to recover them.
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
