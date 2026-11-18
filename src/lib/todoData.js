export const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Normalise a saved list (local or cloud), migrating the old { no, text, display } format.
// Always returns objects with the same key order so they can be compared as JSON.
export const sanitizeTodos = (data) =>
  Array.isArray(data)
    ? data
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({
          id: String(t.id ?? t.no ?? makeId()),
          text: t.text,
          done: Boolean(t.done ?? t.display === "line-through"),
          spent: Number(t.spent) || 0,
        }))
    : [];

export const sanitizeTimer = (t) =>
  t && typeof t.id === "string" && Number.isFinite(t.since) ? { id: t.id, since: t.since } : null;

// ---- Daily log: { "YYYY-MM-DD": { [taskId]: { text, ms, done } } } ----

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const nextMidnight = (ts) => {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));

export const sanitizeLog = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out = {};
  for (const day of Object.keys(data).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !data[day] || typeof data[day] !== "object") continue;
    const entries = {};
    for (const id of Object.keys(data[day]).sort()) {
      const e = data[day][id];
      if (!e || typeof e.text !== "string") continue;
      entries[id] = { text: e.text, ms: Math.max(0, Number(e.ms) || 0), done: Boolean(e.done) };
    }
    if (Object.keys(entries).length) out[day] = entries;
  }
  return out;
};

const withEntry = (log, day, id, update) => {
  const dayLog = { ...(log[day] || {}) };
  const entry = update(dayLog[id]);
  if (entry) dayLog[id] = entry;
  else delete dayLog[id];
  const next = { ...log };
  if (Object.keys(dayLog).length) next[day] = sortKeys(dayLog);
  else delete next[day];
  return sortKeys(next);
};

// Add a session [since, until) to the log, split across midnights.
export const logTime = (log, task, since, until = Date.now()) => {
  let next = log;
  let start = since;
  while (start < until) {
    const end = Math.min(until, nextMidnight(start));
    const ms = end - start;
    next = withEntry(next, dayKey(start), task.id, (e) => ({
      text: task.text,
      ms: (e?.ms || 0) + ms,
      done: e?.done || false,
    }));
    start = end;
  }
  return next;
};

// Mark a task done / not done for today.
export const logDone = (log, task, done, at = Date.now()) =>
  withEntry(log, dayKey(at), task.id, (e) =>
    done
      ? { text: task.text, ms: e?.ms || 0, done: true }
      : e && e.ms > 0
        ? { ...e, done: false }
        : null
  );

// Remove all logged time for a task (used by the stopwatch reset).
export const logClearTask = (log, id) => {
  let next = log;
  for (const day of Object.keys(log)) {
    if (log[day][id]) next = withEntry(next, day, id, (e) => (e.done ? { ...e, ms: 0 } : null));
  }
  return next;
};

// Combine two logs, keeping the larger time for entries in both.
export const mergeLogs = (a, b) => {
  const out = { ...a };
  for (const day of Object.keys(b)) {
    const merged = { ...(a[day] || {}) };
    for (const [id, e] of Object.entries(b[day])) {
      const x = merged[id];
      merged[id] = x ? { text: x.text, ms: Math.max(x.ms, e.ms), done: x.done || e.done } : e;
    }
    out[day] = sortKeys(merged);
  }
  return sortKeys(out);
};

// One-time: stopwatch totals recorded before the daily log existed.
// The stopwatch was introduced on 2026-11-18, so all of that time is from that day.
const STOPWATCH_DAY = "2026-11-18";
export const backfillLog = (todos) => {
  const entries = {};
  for (const t of todos) {
    if (t.spent > 0) entries[t.id] = { text: t.text, ms: t.spent, done: t.done };
  }
  return Object.keys(entries).length ? { [STOPWATCH_DAY]: sortKeys(entries) } : {};
};
