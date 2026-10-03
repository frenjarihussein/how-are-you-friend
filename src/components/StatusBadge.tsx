import { cn } from "@/lib/utils";

export type StatusTone = "paid" | "draft" | "void" | "posted";

const TONES: Record<StatusTone, string> = {
  paid: "bg-status-paid text-status-paid-foreground",
  draft: "bg-status-draft text-status-draft-foreground",
  void: "bg-status-void text-status-void-foreground",
  posted: "bg-status-posted text-status-posted-foreground",
};

export function toneFor(status: string | null | undefined): StatusTone {
  switch (status) {
    case "posted":
      return "posted";
    case "paid":
    case "cleared":
    case "collected":
      return "paid";
    case "cancelled":
    case "void":
    case "bounced":
      return "void";
    default:
      return "draft";
  }
}

export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
