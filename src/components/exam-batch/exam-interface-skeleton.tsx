// Standalone skeleton for the Exam Interface. Kept in its own tiny module
// so the route file can render it INSTANTLY as a Suspense fallback while
// the (heavy) exam-interface.tsx chunk downloads — the student never sees
// a blank white pane between clicking "Continue" and the exam mounting.
export function ExamInterfaceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="glass shadow-card-soft h-24 animate-pulse rounded-2xl bg-muted/30" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="glass shadow-card-soft h-96 animate-pulse rounded-3xl bg-muted/30" />
        <div className="glass shadow-card-soft hidden h-96 animate-pulse rounded-3xl bg-muted/30 lg:block" />
      </div>
    </div>
  );
}
