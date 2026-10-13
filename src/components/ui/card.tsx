import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card p-4 sm:p-5", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon ? <div className="mb-3 rounded-2xl bg-navy-50 p-3 text-navy-700">{icon}</div> : null}
      <p className="font-semibold text-navy-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "money" | "danger" | "warning" | "navy";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    money: "bg-money-100 text-money-700",
    danger: "bg-danger-100 text-danger-700",
    warning: "bg-warning-100 text-warning-700",
    navy: "bg-navy-100 text-navy-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "money",
  label,
}: {
  value: number;
  tone?: "money" | "warning" | "danger" | "navy";
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const tones = {
    money: "bg-money-500",
    warning: "bg-warning-700",
    danger: "bg-danger-600",
    navy: "bg-navy-600",
  };
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div className={cn("h-full rounded-full transition-[width]", tones[tone])} style={{ width: `${clamped}%` }} />
    </div>
  );
}
