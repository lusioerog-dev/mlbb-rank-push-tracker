import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import {
  currentRank,
  saveMatch,
  starChange,
  deleteMatch,
} from "../../../packages/tracker/model";
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
          starDelta:
            mode === "ranked"
              ? (number("delta") ??
                (match?.starDelta === null ? null : undefined))
              : null,
          ...(mode === "ranked" && number("checkpoint") !== null
            ? { mythicCheckpoint: number("checkpoint") }
            : {}),
          rankTier: match?.rankTier ?? "",
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
            <legend>Ranked star change</legend>
            <label>
              Stars gained / lost
              <input
                name="delta"
                type="number"
                step="1"
                min="-10000"
                max="10000"
                defaultValue={match ? (starChange(match) ?? "") : ""}
                placeholder="e.g. +1, -1 or 0"
              />
            </label>
            {(currentRank(state).needsRankConfirmation ||
              match?.mythicCheckpoint !== undefined) && (
              <label>
                Confirmed Mythic stars after placement (optional)
                <input
                  name="checkpoint"
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  defaultValue={match?.mythicCheckpoint ?? ""}
                  placeholder="Use the game's final placement result"
                />
              </label>
            )}
            <p className="muted small">
              Enter the actual star change, including bonuses or protection.
              Victory does not always mean +1. If change is blank, two known
              original observations can supply their difference. Rank is
              calculated from your season starting rank.
            </p>
            <details>
              <summary>Original star observations (optional)</summary>
              <div className="form-grid">
                {numeric(
                  "Before this match",
                  "before",
                  match ? match.starsBefore : undefined,
                )}
                {numeric("After this match", "after", match?.starsAfter)}
              </div>
            </details>
            <p className="muted small">
              {!state.push.startingRank
                ? "Select the season starting rank once in Settings to enable rank labels."
                : currentRank(state).needsRankConfirmation
                  ? "Rank needs confirmation: check placement results or missing star changes before relying on a rank estimate."
                  : `Current account rank: ${currentRank(state).tier}.`}
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
          {match && (
            <button
              type="button"
              disabled={pending}
              className="text-button negative"
              onClick={async (event) => {
                const reason = (
                  event.currentTarget.form!.elements.namedItem(
                    "correction",
                  ) as HTMLInputElement
                ).value;
                if (!reason.trim()) {
                  setError("Explain the deletion in Reason for correction.");
                  return;
                }
                if (
                  !window.confirm(
                    "Remove this match from statistics? Its original record will remain in correction history.",
                  )
                )
                  return;
                setPending(true);
                try {
                  await onSave(deleteMatch(state, match.id, reason));
                  onClose();
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not delete match.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Delete match
            </button>
          )}
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
