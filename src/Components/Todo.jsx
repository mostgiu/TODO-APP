import { useEffect, useMemo, useState } from "react";
import "./Css/Todo.css";
import { TodoItems } from "./TodoItems";
import { useDragReorder } from "./useDragReorder";
import { Account } from "./Account";
import { Summary } from "./Summary";
import {
  logClearTask,
  logDone,
  logTime,
  backfillLog,
  makeId,
  sanitizeLog,
  sanitizeTodos,
} from "../lib/todoData";
import { useCloudSync } from "../lib/useCloudSync";

const STORAGE_KEY = "todos";
const ACTIVE_KEY = "todos_active";
const LOG_KEY = "todos_log";

const loadLog = () => {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw === null) return backfillLog(loadTodos());
    return sanitizeLog(JSON.parse(raw));
  } catch {
    return {};
  }
};
const FILTERS = ["all", "active", "completed"];

const loadTodos = () => {
  try {
    return sanitizeTodos(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
};

// Load the running stopwatch ({ id, since }); older saves held just an id.
const loadTimer = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    try {
      const t = JSON.parse(raw);
      if (t && typeof t.id === "string" && Number.isFinite(t.since)) return t;
    } catch {
      /* not JSON: old plain-id format */
    }
    return { id: raw, since: Date.now() };
  } catch {
    return null;
  }
};

export const Todo = () => {
  const [todos, setTodos] = useState(loadTodos);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("all");
  // The running stopwatch: which task is active and since when.
  const [timer, setTimer] = useState(loadTimer);
  // Per-day record of time spent and tasks finished (for the daily summary).
  const [log, setLog] = useState(loadLog);

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* storage unavailable */
    }
  }, [log]);

  // Ignore the timer if its task was completed or removed.
  const current =
    timer && todos.some((t) => t.id === timer.id && !t.done) ? timer : null;

  useEffect(() => {
    try {
      if (current) localStorage.setItem(ACTIVE_KEY, JSON.stringify(current));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [current]);

  // Signed in with Google: tasks are saved to the account and synced live.
  const cloud = useCloudSync({
    todos,
    timer: current,
    log,
    onRemote: (nextTodos, nextTimer, nextLog) => {
      setTodos(nextTodos);
      setTimer(nextTimer);
      setLog(nextLog);
    },
  });

  // Add the running session's time to its task and to the daily log.
  const commitTime = (list) => {
    if (!current) return list;
    const now = Date.now();
    const task = list.find((t) => t.id === current.id);
    if (task && now > current.since) setLog((prev) => logTime(prev, task, current.since, now));
    return list.map((t) =>
      t.id === current.id ? { ...t, spent: t.spent + Math.max(0, now - current.since) } : t
    );
  };

  const setActive = (id) => {
    setTodos(commitTime(todos));
    setTimer(current?.id === id ? null : { id, since: Date.now() });
  };

  const resetTime = (id) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, spent: 0 } : t)));
    setLog((prev) => logClearTask(prev, id));
    if (current?.id === id) setTimer({ id, since: Date.now() });
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
      localStorage.removeItem("todos_count");
    } catch {
      /* storage unavailable (private mode / quota) */
    }
  }, [todos]);

  const add = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: makeId(), text, done: false, spent: 0 }]);
    setInput("");
  };

  const toggle = (id) => {
    const stopping = current?.id === id;
    const list = stopping ? commitTime(todos) : todos;
    const task = list.find((t) => t.id === id);
    if (task) setLog((prev) => logDone(prev, task, !task.done));
    setTodos(list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    if (stopping) setTimer(null);
  };

  const remove = (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (current?.id === id) setTimer(null);
  };

  const edit = (id, text) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));

  const clearCompleted = () => setTodos((prev) => prev.filter((t) => !t.done));

  const visible = useMemo(() => {
    if (filter === "active") return todos.filter((t) => !t.done);
    if (filter === "completed") return todos.filter((t) => t.done);
    return todos;
  }, [todos, filter]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Swap a task with its neighbour in the currently visible list.
  const move = (id, dir) => {
    const i = visible.findIndex((t) => t.id === id);
    const neighbour = visible[i + dir];
    if (i < 0 || !neighbour) return;
    setTodos((prev) => {
      const a = prev.findIndex((t) => t.id === id);
      const b = prev.findIndex((t) => t.id === neighbour.id);
      if (a < 0 || b < 0) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  // Drag-and-drop: move visible[from] to where visible[to] is.
  const reorder = (from, to) => {
    const fromId = visible[from]?.id;
    const toId = visible[to]?.id;
    if (!fromId || !toId) return;
    setTodos((prev) => {
      const item = prev.find((t) => t.id === fromId);
      const next = prev.filter((t) => t.id !== fromId);
      const j = next.findIndex((t) => t.id === toId);
      if (!item || j < 0) return prev;
      next.splice(from < to ? j + 1 : j, 0, item);
      return next;
    });
  };

  const { listRef, drag, onPointerDown, styleFor } = useDragReorder(reorder);

  const remaining = todos.filter((t) => !t.done).length;
  const completed = todos.length - remaining;

  return (
    <main className="todo">
      <Account cloud={cloud} />
      <header className="todo-top">
        <p className="todo-eyebrow">{today}</p>
        <h1 className="todo-header">To-Do List</h1>
        <p className="todo-sub">
          {todos.length === 0
            ? "A calm place for everything you need to do."
            : remaining === 0
              ? "All done. Enjoy the quiet."
              : `${completed} of ${todos.length} done`}
        </p>
        {todos.length > 0 && (
          <div
            className="todo-progress"
            role="progressbar"
            aria-label="Completed tasks"
            aria-valuemin={0}
            aria-valuemax={todos.length}
            aria-valuenow={completed}
          >
            <span style={{ width: `${(completed / todos.length) * 100}%` }} />
          </div>
        )}
      </header>

      <form className="todo-add" onSubmit={add}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What needs to be done?"
          className="todo-input"
          aria-label="New task"
          maxLength={200}
          autoFocus
        />
        <button type="submit" className="todo-add-btn" disabled={!input.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Add</span>
        </button>
      </form>

      {todos.length > 0 && (
        <div className="todo-toolbar">
          <div className="todo-filters" role="group" aria-label="Filter tasks">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`todo-filter ${filter === f ? "active" : ""}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="todo-stat">
            {remaining} {remaining === 1 ? "task" : "tasks"} left
          </span>
        </div>
      )}

      <ul className="todo-list" ref={listRef}>
        {visible.map((item, i) => (
          <TodoItems
            key={item.id}
            item={item}
            onMove={move}
            isFirst={i === 0}
            isLast={i === visible.length - 1}
            isActive={item.id === current?.id}
            since={item.id === current?.id ? current.since : null}
            onSetActive={setActive}
            onResetTime={resetTime}
            onDragPointerDown={(e) => onPointerDown(e, i)}
            dragStyle={styleFor(i)}
            isDragging={drag?.from === i}
            onToggle={toggle}
            onDelete={remove}
            onEdit={edit}
          />
        ))}
      </ul>

      {todos.length === 0 && (
        <p className="todo-empty">
          Nothing here yet. Add your first task above.
        </p>
      )}
      {todos.length > 0 && visible.length === 0 && (
        <p className="todo-empty">No {filter} tasks.</p>
      )}

      {completed > 0 && (
        <button type="button" className="todo-clear" onClick={clearCompleted}>
          Clear completed ({completed})
        </button>
      )}

      <Summary log={log} todos={todos} timer={current} />

      {todos.length > 0 && (
        <p className="todo-hint">Tip: double-click a task to edit it · press and hold a task, then move it to reorder · press ▶ to start the stopwatch on what you’re working on · or use the arrows (Alt + ↑/↓).</p>
      )}
    </main>
  );
};
