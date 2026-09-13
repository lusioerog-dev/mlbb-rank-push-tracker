import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { currentRank, saveMatch } from "../../../packages/tracker/model";
import type { Match, TrackerState } from "../../../packages/tracker/model";
import { localInput, toInstant } from "../../../packages/tracker/time";

export function MatchForm({
  state,
  match,
  onSave,
  onClose,
}: {
  state: TrackerState;
  match: Match | null;
  onSave: (next: TrackerState) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<Match["mode"]>(match?.mode ?? "ranked");
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      const text = (key: string) => String(form.get(key) ?? "").trim();
      const number = (key: string) =>
        text(key) === "" ? null : Number(text(key));
      const heroName = text("hero");
      const existing = state.heroes.find(
        (h) => h.name.toLowerCase() === heroName.toLowerCase(),
      );
      const hero = heroName
        ? (existing ?? { id: crypto.randomUUID(), name: heroName })
        : null;
      const next =
        hero && !existing
          ? { ...state, heroes: [...state.heroes, hero] }
          : state;
      const minutes = number("minutes"),
        seconds = number("seconds");
      const now = new Date().toISOString();
      const result = saveMatch(
        next,
        {
          id: match?.id ?? crypto.randomUUID(),
          playerId: text("player"),
          heroId: hero?.id ?? null,
          playedAt: toInstant(text("date"), state.push.timezone),
          mode,
          result: text("result"),
          kills: number("kills"),
          deaths: number("deaths"),
          assists: number("assists"),
          durationSeconds:
            minutes === null && seconds === null
              ? null
              : (minutes ?? 0) * 60 + (seconds ?? 0),
          starsBefore: mode === "ranked" ? number("before") : null,
          starsAfter: mode === "ranked" ? number("after") : null,
          rankTier: text("tier"),
          source: match?.source ?? "manual",
          notes: text("notes"),
          createdAt: match?.createdAt ?? now,
          updatedAt: now,
        },
        text("correction"),
      );
      await onSave(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this match.");
    } finally {
      setPending(false);
    }
  }
  const numeric = (
    label: string,
    field: string,
    value: number | null | undefined,
    max = 1000000,
  ) => (
    <label>
      {label}
      <input
        type="number"
        name={field}
        min="0"
        max={max}
        step="1"
        defaultValue={value ?? ""}
        placeholder="Unknown"
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="match-dialog"
      aria-labelledby="match-form-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">
            {state.dataset === "demo" ? "DEMO TRACKER" : "SHARED ACCOUNT"}
          </p>
          <h2 id="match-form-title">
            {match ? "Edit match" : "Record a match"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close match form"
        >
          <X />
        </button>
      </div>
      <p className="muted">
        Choose who played. Leave anything you don’t know blank.
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Played by
            <select
              name="player"
              defaultValue={match?.playerId ?? state.players[0]!.id}
            >
              {state.players.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Match time · {state.push.timezone}
            <input
              type="datetime-local"
              name="date"
              required
              defaultValue={localInput(
                match?.playedAt ?? new Date().toISOString(),
                state.push.timezone,
              )}
            />
          </label>
          <label>
            Hero
            <input
              name="hero"
              list="hero-options"
              maxLength={80}
              defaultValue={
                state.heroes.find((h) => h.id === match?.heroId)?.name ?? ""
              }
              placeholder="Enter hero name, if known"
            />
            <datalist id="hero-options">
              {state.heroes.map((h) => (
                <option key={h.id} value={h.name} />
              ))}
            </datalist>
          </label>
          <label>
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Match["mode"])}
            >
              <option value="ranked">Ranked</option>
              <option value="classic">Classic</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Result
            <select name="result" defaultValue={match?.result ?? "win"}>
              <option value="win">Victory</option>
              <option value="loss">Defeat</option>
              <option value="draw">Draw</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Rank tier
            <input
              name="tier"
              maxLength={80}
              defaultValue={match?.rankTier ?? state.push.rankTier}
              placeholder="Optional, e.g. Mythical Immortal"
            />
          </label>
        </div>
        <fieldset>
          <legend>
            Performance <span>optional</span>
          </legend>
          <div className="form-grid three">
            {numeric("Kills", "kills", match?.kills)}
            {numeric("Deaths", "deaths", match?.deaths)}
            {numeric("Assists", "assists", match?.assists)}
          </div>
          <div className="form-grid">
            {numeric(
              "Duration · minutes",
              "minutes",
              match?.durationSeconds == null
                ? null
                : Math.floor(match.durationSeconds / 60),
              1440,
            )}
            {numeric(
              "Duration · seconds",
              "seconds",
              match?.durationSeconds == null
                ? null
                : match.durationSeconds % 60,
              59,
            )}
          </div>
        </fieldset>
        {mode === "ranked" && (
          <fieldset>
            <legend>Actual account stars</legend>
            <p className="muted small">
              Use the before → after values from history. A loss can have zero
              change. For tier changes, leave these blank and note both ranks
              below.
            </p>
            <div className="form-grid">
              {numeric(
                "Before this match",
                "before",
                match ? match.starsBefore : currentRank(state).stars,
              )}
              {numeric("After this match", "after", match?.starsAfter)}
            </div>
            <p className="muted small">
              Before is suggested from the latest record. Check it for older
              matches.
            </p>
          </fieldset>
        )}
        <label>
          Notes
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={match?.notes ?? ""}
            placeholder="Star protection, shared phone, or anything to remember…"
            rows={2}
          />
        </label>
        {match && (
          <label>
            Reason for correction
            <input
              name="correction"
              required
              maxLength={300}
              placeholder="What changed and why?"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={pending}>
            {match ? "Save correction" : "Save match"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
