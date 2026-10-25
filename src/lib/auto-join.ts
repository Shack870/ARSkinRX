/**
 * Live patients skip the lobby: the live page sets a session flag (and
 * `?auto=1`) when a request is matched, and the visit page requests the
 * camera itself and goes straight into the room.
 */
export const AUTO_JOIN_KEY = "arx:auto-join";

export function markAutoJoin(appointmentId: string) {
  try {
    sessionStorage.setItem(`${AUTO_JOIN_KEY}:${appointmentId}`, "1");
  } catch {
    /* storage unavailable — the ?auto=1 query still carries the intent */
  }
}

export function consumeAutoJoin(appointmentId: string): boolean {
  try {
    const key = `${AUTO_JOIN_KEY}:${appointmentId}`;
    const hit = sessionStorage.getItem(key) === "1";
    if (hit) sessionStorage.removeItem(key);
    return hit;
  } catch {
    return false;
  }
}
