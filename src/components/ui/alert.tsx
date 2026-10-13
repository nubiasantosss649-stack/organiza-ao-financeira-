import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const styles = {
  info: { box: "border-navy-100 bg-navy-50 text-navy-800", Icon: Info },
  success: { box: "border-money-100 bg-money-50 text-money-700", Icon: CheckCircle2 },
  warning: { box: "border-warning-100 bg-warning-50 text-warning-700", Icon: AlertTriangle },
  error: { box: "border-danger-100 bg-danger-50 text-danger-700", Icon: XCircle },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof styles;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
