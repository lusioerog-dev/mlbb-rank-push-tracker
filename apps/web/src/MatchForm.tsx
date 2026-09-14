import { PLAYERS } from "../../../packages/tracker/players";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import {
  currentRank,
  saveMatch,
  starChange,
  deleteMatch,
  recordHeroObservation,
} from "../../../packages/tracker/model";
import type { Match, TrackerState } from "../../../packages/tracker/model";
import {
  RANK_RULES,
  rankTiers,
  type StartingRank,
} from "../../../packages/tracker/rank-rules";
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
  const mode: Match["mode"] = match?.mode ?? "ranked";
  const currentHero = state.heroes.find((hero) => hero.id === match?.heroId);
  const rank = currentRank(state);
  const [checkpointTier, setCheckpointTier] = useState<
    StartingRank["tier"] | ""
  >(
    match?.rankCheckpoint?.position.tier ??
      (match?.mythicCheckpoint !== undefined ||
      rank.placementStatus === "pending"
        ? "Mythic"
        : ""),
  );
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
      const hero = recordHeroObservation(
        state,
        text("hero"),
        text("heroGameId"),
      );
      const minutes = number("minutes"),
        seconds = number("seconds");
      const now = new Date().toISOString();
      const result = saveMatch(
        hero.state,
        {
          id: match?.id ?? crypto.randomUUID(),
          battleId: text("battleId") || null,
          playerId: text("player"),
          heroId: hero.heroId,
          heroObservation: hero.observation,
          playedPosition: text("position") || null,
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
          ...(mode === "ranked" && checkpointTier
            ? {
                rankCheckpoint: {
                  kind: text("checkpointKind"),
                  position: {
                    tier: checkpointTier,
                    division:
                      checkpointTier === "Mythic"
                        ? null
                        : Number(text("checkpointDivision")),
                    stars: Number(text("checkpointStars")),
                    rulesVersion: RANK_RULES.version,
                  },
                  confirmedAt: now,
                  reason: text("checkpointReason"),
                },
              }
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
          <p className="eyebrow">SHARED ACCOUNT</p>
          <h2 id="match-form-title">
            {match ? "Edit match" : "Record Ranked match"}
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
              {PLAYERS.map((p) => (
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
            Battle ID <span className="muted">optional</span>
            <input
              name="battleId"
              maxLength={100}
              defaultValue={match?.battleId ?? ""}
              placeholder="Keep leading zeros"
            />
          </label>
          <label>
            Hero
            <input
              name="hero"
              list="hero-options"
              maxLength={80}
              defaultValue={
                match?.heroObservation?.name ?? currentHero?.name ?? ""
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
            Verified hero ID <span className="muted">optional</span>
            <input
              name="heroGameId"
              maxLength={100}
              defaultValue={
                match?.heroObservation === undefined
                  ? (currentHero?.gameId ?? "")
                  : (match.heroObservation?.gameId ?? "")
              }
              placeholder="Only when confirmed"
            />
          </label>
          <label>
            Position played <span className="muted">optional</span>
            <select name="position" defaultValue={match?.playedPosition ?? ""}>
              <option value="">Not recorded</option>
              <option value="exp_lane">EXP lane</option>
              <option value="gold_lane">Gold lane</option>
              <option value="mid_lane">Mid lane</option>
              <option value="roam">Roam</option>
              <option value="jungle">Jungle</option>
            </select>
          </label>
          <label>
            Result
            <select name="result" defaultValue={match?.result ?? "win"}>
              <option value="win">Victory</option>
              <option value="loss">Defeat</option>
              {match?.result === "draw" && <option value="draw">Draw</option>}
              <option value="unknown">Not confirmed</option>
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
            <p className="muted small">
              Enter the actual star change, including bonuses or protection. Use
              0 for a protected loss. Leave blank if unconfirmed.
            </p>
            <details open={rank.placementStatus === "pending"}>
              <summary>Confirmed rank after this match (optional)</summary>
              <p className="muted small">
                Use this after placement or when the game confirms the account
                rank. It resumes calculations after an unknown gap.
              </p>
              <div className="form-grid">
                <label>
                  Confirmed tier
                  <select
                    name="checkpointTier"
                    value={checkpointTier}
                    onChange={(event) =>
                      setCheckpointTier(
                        event.target.value as StartingRank["tier"] | "",
                      )
                    }
                  >
                    <option value="">No checkpoint</option>
                    {rankTiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>
                {checkpointTier && checkpointTier !== "Mythic" && (
                  <label>
                    Confirmed division
                    <select
                      name="checkpointDivision"
                      defaultValue={
                        match?.rankCheckpoint?.position.tier === checkpointTier
                          ? (match.rankCheckpoint.position.division ?? 1)
                          : 1
                      }
                    >
                      {Array.from(
                        {
                          length: RANK_RULES.divisions[checkpointTier].count,
                        },
                        (_, index) => index + 1,
                      ).map((division) => (
                        <option key={division} value={division}>
                          {["", "I", "II", "III", "IV", "V"][division]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {checkpointTier && (
                  <>
                    <label>
                      Confirmed stars
                      <input
                        name="checkpointStars"
                        type="number"
                        min="0"
                        max={
                          checkpointTier === "Mythic"
                            ? 1000000
                            : RANK_RULES.divisions[checkpointTier].stars
                        }
                        required
                        defaultValue={
                          match?.rankCheckpoint?.position.stars ??
                          match?.mythicCheckpoint ??
                          ""
                        }
                      />
                    </label>
                    <label>
                      Checkpoint type
                      <select
                        name="checkpointKind"
                        defaultValue={
                          match?.rankCheckpoint?.kind ??
                          (rank.placementStatus === "pending"
                            ? "placement"
                            : "observation")
                        }
                      >
                        <option value="placement">Placement result</option>
                        <option value="observation">Observed in game</option>
                        <option value="correction">Rank correction</option>
                      </select>
                    </label>
                    <label>
                      Why this rank is confirmed
                      <input
                        name="checkpointReason"
                        required
                        maxLength={300}
                        defaultValue={match?.rankCheckpoint?.reason ?? ""}
                        placeholder="e.g. placement result screen"
                      />
                    </label>
                  </>
                )}
              </div>
            </details>
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
                : rank.placementStatus === "pending"
                  ? "Placement is pending. Add the confirmed result when the game shows it."
                  : rank.needsRankConfirmation
                    ? "Rank needs confirmation after an unknown star change."
                    : `Current account rank: ${rank.tier}.`}
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
