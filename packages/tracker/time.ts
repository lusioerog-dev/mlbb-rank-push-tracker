export function localInput(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function toInstant(local: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Enter a valid match date and time.");
  const target = Date.parse(`${local}:00Z`);
  let guess = target;
  for (let i = 0; i < 4; i++)
    guess +=
      target -
      Date.parse(`${localInput(new Date(guess).toISOString(), timezone)}:00Z`);
  const result = new Date(guess).toISOString();
  if (localInput(result, timezone) !== local)
    throw new Error("This local time does not exist in the selected timezone.");
  // Reject ambiguous DST times rather than silently choose one.
  for (const shift of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000])
    if (localInput(new Date(guess + shift).toISOString(), timezone) === local)
      throw new Error(
        "This time repeats at a clock change. Choose an unambiguous time.",
      );
  return result;
}
