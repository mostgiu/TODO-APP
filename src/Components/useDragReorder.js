import { useEffect, useRef, useState } from "react";

const INTERACTIVE = "button, input, textarea, select, a";

// Press and hold an item, then move it up or down to reorder.
// Works with mouse, pen and touch. Calls onReorder(fromIndex, toIndex) on drop.
export const useDragReorder = (onReorder, { holdMs = 100, gap = 10, slop = 8 } = {}) => {
  const listRef = useRef(null);
  const session = useRef(null);
  const [drag, setDrag] = useState(null); // { from, to, dy, step }

  // Stop the page from scrolling while a touch drag is in progress.
  // Registered up front (non-passive) so the browser waits for it.
  useEffect(() => {
    const block = (e) => {
      if (session.current?.active) e.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      session.current?.cleanup(false);
    };
  }, []);

  const onPointerDown = (e, index) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE) || session.current) return;

    const el = e.currentTarget;
    const { pointerId, clientX: startX, clientY: startY } = e;
    const s = { from: index, to: index, active: false, layout: [] };

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!s.active) {
        // Moved before the hold finished: treat it as a scroll / normal gesture.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > slop) s.cleanup(false);
        return;
      }
      ev.preventDefault();
      const dy = ev.clientY - startY;
      const me = s.layout[s.from];
      const center = me.top + dy + me.height / 2;
      let to = s.from;
      for (let i = s.from + 1; i < s.layout.length; i++) {
        if (center > s.layout[i].top + s.layout[i].height / 2) to = i;
      }
      for (let i = s.from - 1; i >= 0; i--) {
        if (center < s.layout[i].top + s.layout[i].height / 2) to = i;
      }
      s.to = to;
      setDrag({ from: s.from, to, dy, step: me.height + gap });
    };

    const up = (ev) => {
      if (ev.pointerId === pointerId) s.cleanup(ev.type === "pointerup");
    };

    s.cleanup = (commit) => {
      clearTimeout(s.timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("is-dragging");
      if (s.active && commit && s.to !== s.from) onReorder(s.from, s.to);
      session.current = null;
      setDrag(null);
    };

    s.timer = setTimeout(() => {
      if (!listRef.current) return s.cleanup(false);
      s.layout = [...listRef.current.children].map((li) => {
        const r = li.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });
      s.active = true;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* pointer already released */
      }
      document.body.classList.add("is-dragging");
      navigator.vibrate?.(10);
      setDrag({ from: index, to: index, dy: 0, step: s.layout[index].height + gap });
    }, holdMs);

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    session.current = s;
  };

  // Inline style for the item at `index` while a drag is running.
  const styleFor = (index) => {
    if (!drag) return undefined;
    const { from, to, dy, step } = drag;
    if (index === from) {
      return { transform: `translateY(${dy}px) scale(1.02)`, transition: "none", zIndex: 2 };
    }
    let shift = 0;
    if (from < to && index > from && index <= to) shift = -step;
    if (to < from && index >= to && index < from) shift = step;
    return { transform: `translateY(${shift}px)`, transition: "transform 0.2s ease" };
  };

  return { listRef, drag, onPointerDown, styleFor };
};
