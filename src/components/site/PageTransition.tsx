import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <div
      style={{
        position: "relative",
        isolation: "isolate",
        backgroundColor: "var(--color-background)",
        minHeight: "100vh",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, transform: "translate3d(0, 4px, 0)" }}
          animate={{
            opacity: 1,
            transform: "translate3d(0, 0px, 0)",
            transition: { duration: 0.22, ease: EASE },
          }}
          exit={{
            opacity: 0,
            transform: "translate3d(0, 0px, 0)",
            transition: { duration: 0.18, ease: EASE },
          }}
          style={{
            willChange: "opacity, transform",
            backfaceVisibility: "hidden",
            backgroundColor: "var(--color-background)",
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
