import { useEffect, useState } from "react";
import { dayKey } from "../lib/todoData";
import "./Css/Summary.css";

const DAY_MS = 24 * 60 * 60 * 1000;

// 45s · 12m · 1h 05m
const formatDuration = (ms) => {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return `${Math.floor(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const shiftDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

const dayLabel = (offset, ts) => {
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

// Daily summary: how much time went into which task, and what got finished, per day.
export const Summary = ({ log, todos, timer }) => {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0); // 0 = today, 1 = yesterday, ...

  // Tick every second while a stopwatch runs, otherwise just keep the date fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), timer ? 1000 : 30000);
    return () => clearInterval(id);
  }, [timer]);

  const days = Object.keys(log);
  if (!days.length && !timer) return null;

  const selectedTs = shiftDays(now, -offset);
  const key = dayKey(selectedTs);
  const earliest = days[0] ?? key;

  // Logged entries for the day, plus the running session's share of it.
  const entries = { ...(log[key] || {}) };
  if (timer) {
    const from = Math.max(timer.since, startOfDay(selectedTs));
    const to = Math.min(now, startOfDay(selectedTs) + DAY_MS);
    if (to > from) {
      const task = todos.find((t) => t.id === timer.id);
      const e = entries[timer.id];
      entries[timer.id] = {
        text: task?.text ?? e?.text ?? "Task",
        ms: (e?.ms || 0) + (to - from),
        done: e?.done || false,
        running: true,
      };
    }
  }

  const rows = Object.entries(entries)
    .map(([id, e]) => ({ id, ...e, text: todos.find((t) => t.id === id)?.text ?? e.text }))
    .sort((a, b) => b.ms - a.ms || Number(b.done) - Number(a.done));
  const total = rows.reduce((sum, r) => sum + r.ms, 0);
  const doneCount = rows.filter((r) => r.done).length;
  const longest = Math.max(1, ...rows.map((r) => r.ms));

  return (
    <section className="summary" aria-labelledby="summary-title">
      <div className="summary-head">
        <h2 className="summary-eyebrow" id="summary-title">Daily summary</h2>
        <div className="summary-nav">
          <button
            type="button"
            className="summary-nav-btn"
            onClick={() => setOffset((o) => o + 1)}
            disabled={key <= earliest}
            aria-label="Previous day"
          >
            ‹
          </button>
          <span className="summary-day">{dayLabel(offset, selectedTs)}</span>
          <button
            type="button"
            className="summary-nav-btn"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      <p className="summary-total">{formatDuration(total)}</p>
      <p className="summary-meta">
        {rows.length === 0
          ? "Nothing tracked on this day."
          : `${rows.length} ${rows.length === 1 ? "task" : "tasks"} worked on · ${doneCount} done`}
      </p>

      {rows.length > 0 && (
        <ul className="summary-list">
          {rows.map((r) => (
            <li key={r.id} className={`summary-row ${r.done ? "done" : ""}`}>
              <div className="summary-row-top">
                <span className="summary-text">
                  {r.done && <span className="summary-check" aria-label="Done">✓</span>}
                  {r.text}
                  {r.running && <span className="summary-live">running</span>}
                </span>
                <span className="summary-time">{r.ms > 0 ? formatDuration(r.ms) : "—"}</span>
              </div>
              <span className="summary-bar" aria-hidden="true">
                <span style={{ width: `${(r.ms / longest) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
