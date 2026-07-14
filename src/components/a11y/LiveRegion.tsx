import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Announce = (message: string, priority?: "polite" | "assertive") => void;

const LiveRegionContext = createContext<Announce | null>(null);

/**
 * Global aria-live region. Wrap the app once; call useAnnounce() from
 * anywhere to announce dynamic updates (toasts, async results, route
 * changes) to assistive tech.
 */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback<Announce>((message, priority = "polite") => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    if (priority === "assertive") {
      setAssertive("");
      requestAnimationFrame(() => setAssertive(message));
    } else {
      setPolite("");
      requestAnimationFrame(() => setPolite(message));
    }
    timer.current = setTimeout(() => {
      setPolite("");
      setAssertive("");
    }, 4000);
  }, []);

  const value = useMemo(() => announce, [announce]);

  return (
    <LiveRegionContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true" role="alert" className="sr-only">
        {assertive}
      </div>
    </LiveRegionContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(LiveRegionContext) ?? (() => undefined);
}
