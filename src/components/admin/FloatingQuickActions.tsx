import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  X,
  Upload,
  Timer,
  Trophy,
  PlayCircle,
  FileText,
  Send,
  Layers,
  Database,
} from "lucide-react";

const ACTIONS: { t: string; i: typeof Upload; to: string; tint: string }[] = [
  { t: "Upload MCQ", i: Upload, to: "/admin/mcq", tint: "from-fuchsia-500 to-purple-500" },
  { t: "Create Quiz", i: Timer, to: "/admin/quiz", tint: "from-sky-500 to-blue-500" },
  { t: "Publish Mock", i: Trophy, to: "/admin/mock-test", tint: "from-amber-500 to-orange-500" },
  {
    t: "Add Video Class",
    i: PlayCircle,
    to: "/admin/classes",
    tint: "from-violet-500 to-indigo-500",
  },
  { t: "Upload Notes", i: FileText, to: "/admin/short-notes", tint: "from-cyan-500 to-teal-500" },
  { t: "Add Flash Card", i: Layers, to: "/admin/flash-cards", tint: "from-pink-500 to-rose-500" },
  {
    t: "Question Bank",
    i: Database,
    to: "/admin/question-bank",
    tint: "from-emerald-500 to-green-500",
  },
  {
    t: "Send Notification",
    i: Send,
    to: "/admin/notifications",
    tint: "from-lime-500 to-emerald-500",
  },
];

export function FloatingQuickActions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto glass shadow-card-soft animate-in fade-in slide-in-from-bottom-2 grid w-64 grid-cols-2 gap-2 rounded-2xl p-3">
          {ACTIONS.map((a) => (
            <Link
              key={a.t}
              to={a.to as never}
              onClick={() => setOpen(false)}
              className={`group flex flex-col items-start gap-1.5 rounded-xl border border-white/10 bg-gradient-to-br ${a.tint} bg-opacity-20 p-2.5 text-left transition-transform hover:-translate-y-0.5`}
            >
              <a.i className="h-4 w-4 text-white drop-shadow" />
              <span className="text-[11px] font-semibold text-white">{a.t}</span>
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        className="bg-cta-gradient pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-glow transition-transform hover:scale-105"
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
