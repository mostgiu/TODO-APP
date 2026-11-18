import { useEffect, useState } from "react";
import "./Css/Todoitems.css";

const Icon = ({ d, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  close: "M6 6l12 12M18 6L6 18",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  play: "M8 5.5v13l10-6.5z",
  pause: "M9 6v12M15 6v12",
  reset: "M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4",
};

const pad = (n) => String(n).padStart(2, "0");

// 75s -> "1:15", 3725s -> "1:02:05"
const formatTime = (ms) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// Shows saved time plus the running session, ticking every second.
const Stopwatch = ({ spent, since }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);

  const ms = spent + (since ? Math.max(0, now - since) : 0);
  return (
    <span
      className={`todoitem-timer ${since ? "running" : ""}`}
      role="timer"
      aria-label={`Time spent: ${formatTime(ms)}`}
    >
      {formatTime(ms)}
    </span>
  );
};

const TAGS = [
  "var(--color-mint-whisper)",
  "var(--color-lavender-drift)",
  "var(--color-butter)",
  "var(--color-clay)",
];

// Stable pastel tag per task, derived from its id.
const tagFor = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TAGS[Math.abs(h) % TAGS.length];
};

export const TodoItems = ({
  item,
  onToggle,
  onDelete,
  onEdit,
  onMove,
  onSetActive,
  onResetTime,
  since,
  onDragPointerDown,
  dragStyle,
  isDragging,
  isFirst,
  isLast,
  isActive,
}) => {
  const { id, text, done, spent = 0 } = item;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = (e) => {
    e?.preventDefault();
    const value = draft.trim();
    if (!value) return; // keep editing; don't allow empty text
    if (value !== text) onEdit(id, value);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="todoitem editing">
        <form className="todoitem-edit-form" onSubmit={save}>
          <input
            className="todoitem-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancel()}
            aria-label="Edit task"
            maxLength={200}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          <button
            type="submit"
            className="icon-btn save"
            disabled={!draft.trim()}
            aria-label="Save changes"
            title="Save (Enter)"
          >
            <Icon d={ICONS.check} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={cancel}
            aria-label="Cancel editing"
            title="Cancel (Esc)"
          >
            <Icon d={ICONS.close} />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li
      className={`todoitem ${done ? "done" : ""} ${isActive ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      style={dragStyle}
      onPointerDown={onDragPointerDown}
      aria-current={isActive ? "step" : undefined}
      onKeyDown={(e) => {
        if (!e.altKey) return;
        if (e.key === "ArrowUp" && !isFirst) {
          e.preventDefault();
          onMove(id, -1);
        } else if (e.key === "ArrowDown" && !isLast) {
          e.preventDefault();
          onMove(id, 1);
        }
      }}
    >
      <span className="todoitem-tag" style={{ background: tagFor(id) }} aria-hidden="true" />

      <div className="todoitem-move">
        <button
          type="button"
          className="move-btn"
          onClick={() => onMove(id, -1)}
          disabled={isFirst}
          aria-label={`Move "${text}" up`}
          title="Move up (Alt + ↑)"
        >
          <Icon d={ICONS.up} size={14} />
        </button>
        <button
          type="button"
          className="move-btn"
          onClick={() => onMove(id, 1)}
          disabled={isLast}
          aria-label={`Move "${text}" down`}
          title="Move down (Alt + ↓)"
        >
          <Icon d={ICONS.down} size={14} />
        </button>
      </div>

      <button
        type="button"
        className="todoitem-check"
        onClick={() => onToggle(id)}
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark "${text}" as ${done ? "not done" : "done"}`}
      >
        <Icon d={ICONS.check} size={14} />
      </button>

      <span className="todoitem-text" onDoubleClick={startEdit} title="Double-click to edit">
        {isActive && <span className="todoitem-now">Now</span>}
        {text}
      </span>

      {(isActive || spent > 0) && <Stopwatch spent={spent} since={since} />}

      {!done && (
        <button
          type="button"
          className={`icon-btn focus-btn ${isActive ? "on" : ""}`}
          onClick={() => onSetActive(id)}
          aria-pressed={isActive}
          aria-label={isActive ? `Pause stopwatch for "${text}"` : `Start stopwatch for "${text}"`}
          title={isActive ? "Pause stopwatch" : "Start stopwatch"}
        >
          <Icon d={isActive ? ICONS.pause : ICONS.play} size={16} />
        </button>
      )}

      <div className="todoitem-actions">
        {spent > 0 && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => onResetTime(id)}
            aria-label={`Reset stopwatch for "${text}"`}
            title="Reset stopwatch"
          >
            <Icon d={ICONS.reset} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={startEdit}
          aria-label={`Edit "${text}"`}
          title="Edit"
        >
          <Icon d={ICONS.edit} />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={() => onDelete(id)}
          aria-label={`Delete "${text}"`}
          title="Delete"
        >
          <Icon d={ICONS.trash} />
        </button>
      </div>
    </li>
  );
};
