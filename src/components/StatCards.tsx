import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Stat = { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "success" | "warning" | "danger" };

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  default: "bg-highlight",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export function StatCards({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div className={cn("no-print mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {stats.map((s) => (
        <div key={s.label} className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-soft">
          <span className={cn("absolute inset-y-3 start-0 w-0.5 rounded-full", TONE[s.tone ?? "default"])} />
          <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
          <p className="num mt-1.5 text-2xl font-semibold tracking-tight">{s.value}</p>
          {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/** Tiny dependency-free sparkline. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return <div className={cn("h-10", className)} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const w = 120;
  const h = 40;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 4) - 2]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]!.toFixed(1)},${p[1]!.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-full", className)} preserveAspectRatio="none" style={{ direction: "ltr" }}>
      <path d={`${d} L${w},${h} L0,${h} Z`} className="fill-current opacity-10" />
      <path d={d} className="fill-none stroke-current" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
