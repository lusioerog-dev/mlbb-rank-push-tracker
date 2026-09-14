export const PLAYERS = [
  { id: "gaurav", name: "Gaurav" },
  { id: "rupesh", name: "Rupesh" },
] as const;

export function playerName(id: string) {
  return PLAYERS.find((player) => player.id === id)?.name ?? "Unmapped player";
}
