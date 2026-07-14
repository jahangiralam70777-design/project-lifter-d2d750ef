// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "@/stores/app-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SESSION_KEYS,
  SESSION_TIMEOUTS,
  clearSessionTimers,
  getRememberMe,
  readLastActivity,
  writeLastActivity,
} from "@/lib/session-timeout";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
  "pointerdown",
] as const;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SessionTimeoutGuard() {
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  const [warningOpen, setWarningOpen] = useState(false);
  const [remaining, setRemaining] = useState<number>(SESSION_TIMEOUTS.WARNING_BEFORE_MS);

  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);

  const isAdmin =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.role === "moderator";
  const timeoutMs = isAdmin ? SESSION_TIMEOUTS.ADMIN_MS : SESSION_TIMEOUTS.STUDENT_MS;

  const recordActivity = useCallback(() => {
    const now = Date.now();
    // Throttle localStorage writes to once per second.
    if (now - lastWriteRef.current < 1000) return;
    lastWriteRef.current = now;
    writeLastActivity(now);
  }, []);

  const stayLoggedIn = useCallback(() => {
    const now = Date.now();
    lastWriteRef.current = now;
    writeLastActivity(now);
    setWarningOpen(false);
  }, []);

  const performLogout = useCallback(
    async (reason: "inactivity" | "manual" = "inactivity") => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      setWarningOpen(false);
      clearSessionTimers();
      try {
        await logout();
      } finally {
        navigate({
          to: "/login",
          search: reason === "inactivity" ? { expired: "1" } : undefined,
          replace: true,
        });
        loggingOutRef.current = false;
      }
    },
    [logout, navigate],
  );

  // Reset on user change (fresh login or logout).
  useEffect(() => {
    if (!user) {
      setWarningOpen(false);
      loggingOutRef.current = false;
      return;
    }
    const now = Date.now();
    lastWriteRef.current = now;
    writeLastActivity(now);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to activity events.
  useEffect(() => {
    if (!user) return;
    const handler = () => recordActivity();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    // Cross-tab sync: when another tab updates activity, mirror it locally.
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEYS.LAST_ACTIVITY) {
        lastWriteRef.current = readLastActivity();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      window.removeEventListener("storage", onStorage);
    };
  }, [user, recordActivity]);

  // Tick: check timeout state every second.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      const last = readLastActivity();
      const elapsed = Date.now() - last;
      const rememberMe = getRememberMe();
      const effectiveTimeout = rememberMe && !isAdmin ? SESSION_TIMEOUTS.REMEMBER_ME_MS : timeoutMs;

      if (elapsed >= effectiveTimeout) {
        void performLogout("inactivity");
        return;
      }
      const untilLogout = effectiveTimeout - elapsed;
      // Only show 5-min warning for normal (non remember-me) sessions, or
      // for admins (admin sessions always honor the strict timeout).
      const shouldWarn =
        untilLogout <= SESSION_TIMEOUTS.WARNING_BEFORE_MS && (!rememberMe || isAdmin);
      if (shouldWarn) {
        setRemaining(untilLogout);
        setWarningOpen(true);
      } else if (warningOpen) {
        setWarningOpen(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [user, isAdmin, timeoutMs, performLogout, warningOpen]);

  if (!user) return null;

  return (
    <Dialog
      open={warningOpen}
      onOpenChange={(open) => {
        if (!open) stayLoggedIn();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your session is about to expire</DialogTitle>
          <DialogDescription>
            You'll be signed out automatically in{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatCountdown(remaining)}
            </span>{" "}
            due to inactivity. Choose to stay signed in or log out now.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => void performLogout("manual")}>
            Log out now
          </Button>
          <Button onClick={stayLoggedIn}>Stay logged in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}