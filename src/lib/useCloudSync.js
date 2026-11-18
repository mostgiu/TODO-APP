import { useEffect, useRef, useState } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, cloudEnabled, db, googleProvider } from "./firebase";
import { backfillLog, mergeLogs, sanitizeLog, sanitizeTimer, sanitizeTodos } from "./todoData";

const userDoc = (uid) => doc(db, "users", uid);
const snapshotOf = (todos, timer, log) => JSON.stringify({ todos, timer, log });
const MERGE_KEY = "todos_merge_on_login";

const SIGN_IN_ERRORS = {
  "auth/unauthorized-domain": "This web address isn’t allowed to sign in. Add it under Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "Google sign-in is turned off in Firebase (Authentication → Sign-in method).",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/internal-error": "Google sign-in hit an internal error. Try again, or open the app in Chrome or Safari.",
};
const describe = (err) =>
  `${SIGN_IN_ERRORS[err?.code] ?? "Sign-in failed."} (${err?.code ?? err?.message ?? "unknown error"})`;

// Keeps the task list in Firestore (users/{uid}) while signed in with Google,
// and live-syncs changes made on other devices.
export const useCloudSync = ({ todos, timer, log, onRemote }) => {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState(() => (cloudEnabled ? undefined : null));
  const [readyUid, setReadyUid] = useState(null);
  const [error, setError] = useState("");
  const lastSynced = useRef(null); // JSON of what the cloud currently holds
  const mergeOnLogin = useRef(null); // local tasks to fold in after a fresh sign-in
  const paused = useRef(false); // true while signing out
  const onRemoteRef = useRef(onRemote);

  useEffect(() => {
    onRemoteRef.current = onRemote;
  });

  useEffect(() => {
    if (!auth) return;
    // Coming back from a full-page sign-in: restore the local tasks to merge.
    try {
      const saved = sessionStorage.getItem(MERGE_KEY);
      if (saved) {
        mergeOnLogin.current = JSON.parse(saved);
        sessionStorage.removeItem(MERGE_KEY);
      }
    } catch {
      /* ignore */
    }
    getRedirectResult(auth).catch((err) => {
      console.error("Sign-in redirect failed", err);
      setError(describe(err));
    });
    return onAuthStateChanged(auth, (u) => {
      if (u) paused.current = false;
      setUser(u);
    });
  }, []);

  // Listen to the user's document.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      userDoc(user.uid),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // our own write echoing back
        const local = mergeOnLogin.current;
        mergeOnLogin.current = null;

        if (!snap.exists()) {
          // First sign-in ever: the current list gets uploaded by the save effect.
          lastSynced.current = null;
        } else {
          const data = snap.data();
          const cloudTodos = sanitizeTodos(data.todos);
          const cloudTimer = sanitizeTimer(data.timer);
          const cloudLog = sanitizeLog(data.log);
          lastSynced.current = snapshotOf(cloudTodos, cloudTimer, cloudLog);

          let nextTodos = cloudTodos;
          let nextTimer = cloudTimer;
          // Accounts saved before the daily log existed: build it from the stopwatch totals.
          let nextLog = data.log === undefined ? backfillLog(cloudTodos) : cloudLog;
          if (local) {
            // Fresh sign-in on this device: keep tasks added here before signing in.
            const known = new Set(cloudTodos.map((t) => t.id));
            nextTodos = [...cloudTodos, ...local.todos.filter((t) => !known.has(t.id))];
            nextTimer = cloudTimer ?? local.timer;
            nextLog = mergeLogs(nextLog, sanitizeLog(local.log));
          }
          onRemoteRef.current(nextTodos, nextTimer, nextLog);
        }
        setError("");
        setReadyUid(user.uid);
      },
      (err) => setError(err.code === "permission-denied" ? "No access to saved tasks." : "Can’t reach your account right now.")
    );
  }, [user]);

  const ready = Boolean(user) && readyUid === user.uid;

  const save = (uid, json, t, tm, lg) => {
    lastSynced.current = json;
    return setDoc(userDoc(uid), { todos: t, timer: tm, log: lg, updatedAt: serverTimestamp() }).catch(() => {
      lastSynced.current = null;
      setError("Couldn’t save. Changes will retry on your next edit.");
    });
  };

  // Save local changes (debounced).
  useEffect(() => {
    if (!user || !ready || paused.current) return;
    const json = snapshotOf(todos, timer, log);
    if (json === lastSynced.current) return;
    const id = setTimeout(() => {
      if (!paused.current) save(user.uid, json, todos, timer, log);
    }, 400);
    return () => clearTimeout(id);
  }, [user, ready, todos, timer, log]);

  const signIn = async () => {
    setError("");
    mergeOnLogin.current = { todos, timer, log };
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (popupErr) {
      let err = popupErr;
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        mergeOnLogin.current = null;
        return;
      }
      // Popups blocked or unsupported (e.g. an in-editor preview): sign in on a full page instead.
      if (
        err.code === "auth/popup-blocked" ||
        err.code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          sessionStorage.setItem(MERGE_KEY, JSON.stringify({ todos, timer, log }));
        } catch {
          /* ignore */
        }
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          err = redirectErr;
        }
      }
      mergeOnLogin.current = null;
      console.error("Sign-in failed", err);
      setError(describe(err));
    }
  };

  const signOut = async () => {
    // Flush anything not yet saved. Only clear this device if the account
    // really holds the list; otherwise keep the tasks here so nothing is lost.
    const json = snapshotOf(todos, timer, log);
    let safe = Boolean(user && ready && !error);
    if (safe && json !== lastSynced.current) {
      await save(user.uid, json, todos, timer, log);
      safe = lastSynced.current === json;
    }
    paused.current = true;
    await fbSignOut(auth);
    lastSynced.current = null;
    if (safe) onRemoteRef.current([], null, {});
  };

  const status = !user ? "" : error ? "error" : ready ? "synced" : "loading";
  return { enabled: cloudEnabled, user, status, error, signIn, signOut };
};
