import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useState,
} from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
    >
      {children}
    </label>
  );
}

export const NeoInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }
>(function NeoInput({ icon, className = "", id, ...props }, ref) {
  return (
    <div className="group relative">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-[var(--neon-purple)]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        {...props}
        className={`h-11 w-full rounded-xl border border-border bg-background/60 px-4 ${
          icon ? "pl-10" : ""
        } text-sm placeholder:text-muted-foreground/70 outline-none transition focus:border-[var(--neon-purple)] focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--neon-purple)_18%,transparent)] ${className}`}
      />
    </div>
  );
});

export function PasswordInput({
  placeholder = "••••••••",
  onChange,
  value,
  name,
  id,
  autoComplete = "current-password",
}: {
  placeholder?: string;
  onChange?: (v: string) => void;
  value?: string;
  name?: string;
  id?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        name={name}
        autoComplete={autoComplete}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-background/60 px-4 pr-12 text-sm placeholder:text-muted-foreground/70 outline-none transition focus:border-[var(--neon-purple)] focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--neon-purple)_18%,transparent)]"
      />
      <button
        type="button"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function NeonButton({
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
}) {
  const base =
    "relative inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all duration-300";
  if (variant === "primary") {
    return (
      <button
        type={type}
        disabled={disabled}
        {...props}
        className={`${base} text-white shadow-[0_10px_40px_-10px_var(--neon-purple)] hover:shadow-[0_15px_50px_-10px_var(--neon-blue)] hover:-translate-y-0.5 ${className}`}
        style={{ background: "var(--gradient-cta)" }}
      >
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </button>
    );
  }
  if (variant === "danger") {
    return (
      <button
        type={type}
        disabled={disabled}
        {...props}
        className={`${base} bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] hover:-translate-y-0.5 ${className}`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type={type}
      disabled={disabled}
      {...props}
      className={`${base} border border-border bg-card/60 text-foreground backdrop-blur-xl hover:border-[var(--neon-blue)] hover:shadow-[0_0_24px_-4px_var(--neon-blue)] ${className}`}
    >
      {children}
    </button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[a-z]/.test(p) && /\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s; // 0..4
}

export function StrengthMeter({ value }: { value: string }) {
  const score = passwordScore(value);
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Fortress"];
  const colors = [
    "from-rose-500 to-rose-500",
    "from-rose-500 to-amber-400",
    "from-amber-400 to-yellow-300",
    "from-emerald-400 to-teal-400",
    "from-emerald-400 via-cyan-400 to-violet-500",
  ];
  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full bg-muted ${
              i < score ? `bg-gradient-to-r ${colors[score]}` : ""
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{labels[score]}</span>
      </p>
    </div>
  );
}

export function Requirements({ value }: { value: string }) {
  const reqs = [
    { ok: value.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Z]/.test(value), label: "One uppercase letter" },
    { ok: /\d/.test(value), label: "One number" },
    { ok: /[^A-Za-z0-9]/.test(value), label: "One special character" },
  ];
  return (
    <ul className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
      {reqs.map((r) => (
        <li key={r.label} className="flex items-center gap-1.5">
          <span
            className={`grid h-4 w-4 place-items-center rounded-full ${
              r.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
            }`}
          >
            {r.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
          </span>
          <span className={r.ok ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
