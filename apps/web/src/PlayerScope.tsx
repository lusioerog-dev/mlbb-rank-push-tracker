import { PLAYERS, playerName } from "../../../packages/tracker/players";

export function PlayerScope({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="Player view">
      {["all", ...PLAYERS.map((player) => player.id)].map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {id === "all" ? "All" : playerName(id)}
        </button>
      ))}
    </div>
  );
}
