import { useState } from "react";
import {
  Search,
  Bell,
  Moon,
  Sun,
  CircleDot,
  Plus,
  Upload,
  FileUp,
  FileText,
  Download,
  Eye,
  EyeOff,
  Filter,
  ArrowUpDown,
  ListChecks,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Edit3,
  Trash2,
  ChevronRight,
  CloudUpload,
  FileCheck2,
  XCircle,
  Save,
  Tag,
  Zap,
  Activity,
  BarChart3,
  Calendar,
  Users,
  FolderOpen,
  RefreshCw,
} from "lucide-react";

export function McqManagerFlow() {
  return (
    <div className="space-y-4">
      <McqTopbar />
      <Header />
      <ActionBar />
      <FilterPanel />
      <StatGrid />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <McqTable />
          <div className="grid gap-4 lg:grid-cols-2">
            <BulkUploadPanel />
            <ImportPreview />
          </div>
          <SingleMcqCreator />
        </div>
        <aside className="space-y-4">
          <UploadAnalytics />
          <RecentActivity />
        </aside>
      </div>

      <RecentFiles />
    </div>
  );
}

/* ---------------- Topbar ---------------- */
function McqTopbar() {
  const [dark, setDark] = useState(true);
  return (
    <div className="glass shadow-card-soft flex items-center gap-3 rounded-2xl p-3">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search MCQs, subjects, uploads…"
          className="h-10 w-full rounded-xl border border-border/60 bg-background/40 pl-9 pr-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300 md:flex">
          <CircleDot className="h-3 w-3 animate-pulse" /> System healthy
        </div>
        <button
          onClick={() => setDark((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/40"
        >
          {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/40">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta-gradient px-1 text-[9px] font-bold text-white shadow-glow">
            5
          </span>
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-1.5 pr-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cta-gradient text-[10px] font-bold text-white shadow-glow">
            AD
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold">Admin</p>
            <p className="text-[10px] text-muted-foreground">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />
      <div className="relative">
        <div className="text-xs font-semibold uppercase tracking-widest text-[var(--neon-blue)]">
          Content · MCQs
        </div>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-tight md:text-4xl">
          MCQ Management <span className="text-gradient">Center</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Upload, organize, edit and manage all practice MCQs.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Action bar ---------------- */
function ActionBar() {
  const actions = [
    { t: "Add Single MCQ", i: Plus, primary: true },
    { t: "Bulk Upload", i: Upload },
    { t: "Import PDF", i: FileUp },
    { t: "Import DOC/Text", i: FileText },
    { t: "Export", i: Download },
    { t: "Hide/Publish", i: Eye },
  ];
  return (
    <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
      {actions.map((a) => (
        <button
          key={a.t}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 ${
            a.primary
              ? "bg-cta-gradient text-white shadow-glow"
              : "border border-border/60 bg-background/40 text-foreground/80 hover:text-foreground"
          }`}
        >
          <a.i className="h-3.5 w-3.5" />
          {a.t}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Filter panel ---------------- */
function FilterPanel() {
  const selects = [
    { l: "Level", v: "All Levels" },
    { l: "Subject", v: "All Subjects" },
    { l: "Chapter", v: "All Chapters" },
    { l: "Status", v: "All Status" },
  ];
  return (
    <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
      <div className="relative max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search MCQ…"
          className="h-9 w-full rounded-xl border border-border/60 bg-background/40 pl-9 pr-3 text-xs outline-none focus:border-[var(--neon-blue)]/60"
        />
      </div>
      {selects.map((s) => (
        <button
          key={s.l}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs"
        >
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{s.l}:</span>
          <span className="font-medium">{s.v}</span>
        </button>
      ))}
      <button className="ml-auto flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs">
        <ArrowUpDown className="h-3 w-3" /> Latest first
      </button>
      <button className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs">
        <RefreshCw className="h-3 w-3" /> Refresh
      </button>
    </div>
  );
}

/* ---------------- Stats ---------------- */
function StatGrid() {
  const stats = [
    {
      l: "Total MCQs",
      v: "126,408",
      d: "+1,284",
      i: ListChecks,
      tint: "text-fuchsia-300",
      spark: [12, 18, 14, 22, 19, 28, 24],
    },
    {
      l: "Published",
      v: "118,902",
      d: "94.1%",
      i: CheckCircle2,
      tint: "text-emerald-300",
      spark: [10, 14, 20, 18, 26, 30, 34],
    },
    {
      l: "Hidden",
      v: "5,234",
      d: "4.1%",
      i: EyeOff,
      tint: "text-slate-300",
      spark: [22, 18, 20, 16, 18, 14, 12],
    },
    {
      l: "Pending Review",
      v: "2,272",
      d: "1.8%",
      i: Clock,
      tint: "text-amber-300",
      spark: [8, 14, 12, 18, 22, 20, 24],
    },
    {
      l: "Recent Uploads",
      v: "1,284",
      d: "Last 7 days",
      i: Sparkles,
      tint: "text-sky-300",
      spark: [16, 22, 18, 28, 24, 32, 30],
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.l}
          className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
        >
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/10 blur-2xl" />
          <div className="flex items-start justify-between">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 ${s.tint}`}
            >
              <s.i className="h-4 w-4" />
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
              {s.d}
            </span>
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</p>
          <p className="font-display text-2xl font-bold">{s.v}</p>
          <Spark data={s.spark} />
        </div>
      ))}
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 100,
    h = 24;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(" ");
  const id = `g-${data.join("-")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-6 w-full">
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--neon-purple)" />
          <stop offset="100%" stopColor="var(--neon-blue)" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

/* ---------------- MCQ table ---------------- */
function McqTable() {
  const rows = [
    {
      id: "MCQ-10428",
      q: "Which financial statement reports a company's revenues and expenses?",
      lvl: "Certificate",
      sub: "Financial Accounting",
      ch: "Income Statement",
      st: "Published",
      d: "Today",
    },
    {
      id: "MCQ-10427",
      q: "What is the primary purpose of an external audit?",
      lvl: "Professional",
      sub: "Audit",
      ch: "Audit Objectives",
      st: "Published",
      d: "Today",
    },
    {
      id: "MCQ-10426",
      q: "Calculate VAT payable on a BDT 50,000 taxable supply at 15%.",
      lvl: "Professional",
      sub: "Taxation",
      ch: "VAT",
      st: "Pending",
      d: "Yesterday",
    },
    {
      id: "MCQ-10425",
      q: "Define the doctrine of separate legal entity.",
      lvl: "Advanced",
      sub: "Business Law",
      ch: "Company Law",
      st: "Hidden",
      d: "Yesterday",
    },
    {
      id: "MCQ-10424",
      q: "Which costing method assigns overheads using activity drivers?",
      lvl: "Professional",
      sub: "Cost Accounting",
      ch: "ABC Costing",
      st: "Published",
      d: "2d ago",
    },
    {
      id: "MCQ-10423",
      q: "What is the formula for Weighted Average Cost of Capital?",
      lvl: "Advanced",
      sub: "Corporate Finance",
      ch: "Capital Structure",
      st: "Published",
      d: "2d ago",
    },
  ];
  const stTint = (s: string) =>
    s === "Published"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
      : s === "Pending"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
        : "border-slate-400/40 bg-slate-500/10 text-slate-300";
  return (
    <div className="glass shadow-card-soft overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between p-4">
        <div>
          <h3 className="font-display text-lg font-semibold">All MCQs</h3>
          <p className="text-xs text-muted-foreground">Showing 6 of 126,408 questions</p>
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground">View all →</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="border-y border-border/60 bg-background/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">
                <input type="checkbox" className="accent-[var(--neon-purple)]" />
              </th>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Question</th>
              <th className="px-4 py-2.5">Level</th>
              <th className="px-4 py-2.5">Subject</th>
              <th className="px-4 py-2.5">Chapter</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/40 transition-colors hover:bg-background/40"
              >
                <td className="px-4 py-3">
                  <input type="checkbox" className="accent-[var(--neon-purple)]" />
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.id}</td>
                <td className="max-w-[280px] truncate px-4 py-3 font-medium">{r.q}</td>
                <td className="px-4 py-3">{r.lvl}</td>
                <td className="px-4 py-3">{r.sub}</td>
                <td className="px-4 py-3">{r.ch}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${stTint(r.st)}`}>
                    {r.st}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.d}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn i={Eye} tip="Preview" />
                    <IconBtn i={Edit3} tip="Edit" />
                    <IconBtn i={EyeOff} tip="Hide" />
                    <IconBtn i={CheckCircle2} tip="Publish" tone="success" />
                    <IconBtn i={Trash2} tip="Delete" tone="danger" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
        <span>Page 1 of 21,068</span>
        <div className="flex gap-1">
          <button className="rounded-md border border-border/60 px-2 py-1">Prev</button>
          <button className="rounded-md bg-cta-gradient px-2 py-1 text-white">1</button>
          <button className="rounded-md border border-border/60 px-2 py-1">2</button>
          <button className="rounded-md border border-border/60 px-2 py-1">3</button>
          <button className="rounded-md border border-border/60 px-2 py-1">Next</button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  i: Icon,
  tip,
  tone,
}: {
  i: typeof Eye;
  tip: string;
  tone?: "success" | "danger";
}) {
  const t =
    tone === "danger"
      ? "hover:bg-destructive/10 hover:text-destructive"
      : tone === "success"
        ? "hover:bg-emerald-500/10 hover:text-emerald-300"
        : "hover:bg-muted hover:text-foreground";
  return (
    <button
      title={tip}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition-colors ${t}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ---------------- Bulk upload ---------------- */
function BulkUploadPanel() {
  return (
    <div className="glass shadow-card-soft rounded-2xl p-5">
      <h3 className="font-display text-lg font-semibold">Bulk Upload</h3>
      <p className="text-xs text-muted-foreground">PDF, DOC, or TXT · up to 500 MCQs per batch.</p>
      <div className="mt-4 group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-[var(--neon-blue)]/40 bg-background/30 p-8 transition-all hover:border-[var(--neon-purple)]/60">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--neon-purple)]/10 via-transparent to-[var(--neon-blue)]/10 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="relative text-sm font-medium">Drag &amp; drop your file here</p>
        <p className="relative text-[11px] text-muted-foreground">
          or click to browse · PDF · DOCX · TXT · CSV
        </p>
        <button className="relative bg-cta-gradient mt-1 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow">
          Choose File
        </button>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Uploading taxation_set_07.pdf</span>
          <span className="text-foreground">68%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] shadow-[0_0_10px_var(--neon-blue)]" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Import preview ---------------- */
function ImportPreview() {
  const items = [
    { q: "Which IFRS standard governs revenue recognition?", ok: true },
    { q: "State the going concern assumption.", ok: true },
    {
      q: "What is the threshold for VAT registration in Bangladesh?",
      ok: false,
      err: "Option D missing",
    },
    { q: "Define materiality in auditing.", ok: true },
  ];
  const okCount = items.filter((i) => i.ok).length;
  return (
    <div className="glass shadow-card-soft rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Import Preview</h3>
          <p className="text-xs text-muted-foreground">Validating extracted MCQs…</p>
        </div>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
          {okCount}/{items.length} valid
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              it.ok ? "border-border/60 bg-background/40" : "border-rose-400/40 bg-rose-500/10"
            }`}
          >
            <div
              className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg ${
                it.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {it.ok ? <FileCheck2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{it.q}</p>
              <p className="text-[10px] text-muted-foreground">
                {it.ok ? "All 4 options parsed · answer detected" : `Error: ${it.err}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2">
        <button className="bg-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow">
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve Import
        </button>
        <button className="rounded-xl border border-border/60 bg-background/40 px-4 py-2 text-xs">
          Re-validate
        </button>
        <button className="ml-auto rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- Single MCQ creator ---------------- */
function SingleMcqCreator() {
  const [correct, setCorrect] = useState("B");
  return (
    <div className="glass shadow-card-soft rounded-2xl p-5">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Create Single MCQ</h3>
          <p className="text-xs text-muted-foreground">Add a new question to the bank.</p>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2.5 py-1 text-[10px] text-fuchsia-300">
          <Zap className="h-3 w-3" /> Quick add
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <Field label="Question">
          <textarea
            rows={2}
            defaultValue="Which of the following is a noble gas?"
            className="w-full resize-none rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {["A", "B", "C", "D"].map((o, i) => (
            <Option
              key={o}
              letter={o}
              value={["Oxygen", "Argon", "Hydrogen", "Nitrogen"][i]}
              correct={correct === o}
              onSelect={() => setCorrect(o)}
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Difficulty">
            <select className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none">
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </Field>
          <Field label="Subject">
            <select className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none">
              <option>Financial Accounting</option>
              <option>Audit</option>
              <option>Taxation</option>
              <option>Business Law</option>
              <option>Cost Accounting</option>
            </select>
          </Field>
          <Field label="Chapter">
            <input
              defaultValue="Income Statement"
              className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none"
            />
          </Field>
        </div>
        <Field label="Explanation">
          <textarea
            rows={2}
            defaultValue="Noble gases are inert; argon belongs to group 18 of the periodic table."
            className="w-full resize-none rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
            {["periodic-table", "noble-gas", "class-11"].map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full bg-[var(--neon-purple)]/15 px-2 py-0.5 text-[10px] text-fuchsia-300"
              >
                <Tag className="h-2.5 w-2.5" /> {t}
              </span>
            ))}
            <input
              placeholder="add tag…"
              className="min-w-[100px] flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        </Field>

        <div className="flex items-center gap-2 pt-1">
          <button className="bg-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-glow">
            <Save className="h-3.5 w-3.5" /> Save MCQ
          </button>
          <button className="rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-xs">
            Save &amp; Add Another
          </button>
          <button className="ml-auto rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-xs">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Option({
  letter,
  value,
  correct,
  onSelect,
}: {
  letter: string;
  value: string;
  correct: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 transition-all ${
        correct
          ? "border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
          : "border-border/60 bg-background/40 hover:border-[var(--neon-blue)]/40"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
          correct ? "bg-emerald-500/30 text-emerald-200" : "bg-muted/40 text-foreground/70"
        }`}
      >
        {letter}
      </span>
      <input defaultValue={value} className="flex-1 bg-transparent text-sm outline-none" />
      {correct && (
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
          <CheckCircle2 className="h-3 w-3" /> Correct
        </span>
      )}
    </div>
  );
}

/* ---------------- Upload analytics ---------------- */
function UploadAnalytics() {
  const days = [22, 30, 26, 42, 38, 56, 50];
  const subjects = [
    { s: "Financial Accounting", v: 38 },
    { s: "Audit", v: 28 },
    { s: "Taxation", v: 22 },
    { s: "Business Law", v: 12 },
  ];
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[var(--neon-blue)]" />
        <h3 className="text-sm font-semibold">Upload Analytics</h3>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Daily uploads
      </p>
      <div className="mt-2 flex h-20 items-end gap-1.5">
        {days.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-[var(--neon-purple)] to-[var(--neon-blue)]"
              style={{ height: `${b}%` }}
            />
            <span className="text-[9px] text-muted-foreground">
              {["M", "T", "W", "T", "F", "S", "S"][i]}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
        Subject-wise
      </p>
      <ul className="mt-2 space-y-2 text-xs">
        {subjects.map((s) => (
          <li key={s.s}>
            <div className="flex items-center justify-between">
              <span>{s.s}</span>
              <span className="text-muted-foreground">{s.v}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)]"
                style={{ width: `${s.v}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cta-gradient text-[10px] font-bold text-white shadow-glow">
          RK
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium">Most Active · Rahul K.</p>
          <p className="text-[10px] text-muted-foreground">1,284 uploads this week</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Recent activity ---------------- */
function RecentActivity() {
  const acts = [
    {
      i: FileUp,
      t: "Bulk imported 240 MCQs · Taxation",
      time: "4m ago",
      c: "text-fuchsia-300 bg-fuchsia-500/15",
    },
    {
      i: Edit3,
      t: "Edited MCQ-10428 · Financial Accounting",
      time: "12m ago",
      c: "text-sky-300 bg-sky-500/15",
    },
    {
      i: Trash2,
      t: "Deleted 18 duplicate questions",
      time: "30m ago",
      c: "text-rose-300 bg-rose-500/15",
    },
    {
      i: CheckCircle2,
      t: "Published 86 reviewed MCQs",
      time: "1h ago",
      c: "text-emerald-300 bg-emerald-500/15",
    },
    {
      i: CloudUpload,
      t: "Bulk import · audit_set_12.pdf",
      time: "Yesterday",
      c: "text-violet-300 bg-violet-500/15",
    },
  ];
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--neon-purple)]" />
        <h3 className="text-sm font-semibold">Recent Activity</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {acts.map((a, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2.5"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${a.c}`}>
              <a.i className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{a.t}</p>
              <p className="text-[10px] text-muted-foreground">{a.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Recent files ---------------- */
function RecentFiles() {
  const files = [
    { n: "taxation_set_07.pdf", d: "Today · 10:42", q: 240, ok: true, by: "Rahul K." },
    { n: "audit_set_12.pdf", d: "Yesterday", q: 312, ok: true, by: "Anita S." },
    { n: "financial_accounting_set.docx", d: "2d ago", q: 184, ok: false, by: "Vikram J." },
    { n: "business_law_chap5.txt", d: "3d ago", q: 96, ok: true, by: "Meera D." },
  ];
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Recent Imported Files</h3>
          <p className="text-xs text-muted-foreground">Validation results from your bulk uploads</p>
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground">View all</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2">MCQs</th>
              <th className="px-3 py-2">Uploaded by</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.n} className="border-t border-border/40">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/40">
                      <FolderOpen className="h-4 w-4 text-foreground/70" />
                    </div>
                    <span className="font-medium">{f.n}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {f.d}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono">{f.q}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-muted-foreground" /> {f.by}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {f.ok ? (
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                      Valid
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                      Needs review
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-[11px]">
                      <Eye className="h-3 w-3" /> Open
                    </button>
                    <button
                      aria-label="View next"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
