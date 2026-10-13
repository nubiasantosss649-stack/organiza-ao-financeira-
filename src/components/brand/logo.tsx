import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("h-9 w-9 shrink-0", className)}>
      <rect width="64" height="64" rx="14" fill="#0b1f3a" />
      <rect x="16" y="13" width="26" height="12" rx="3" fill="#12a26e" />
      <rect x="11" y="20" width="42" height="30" rx="7" fill="#ffffff" />
      <rect x="37" y="29" width="18" height="12" rx="4" fill="#e3ebf6" />
      <circle cx="44" cy="35" r="2.3" fill="#0b1f3a" />
      <polyline points="16,43 22.5,37 27.5,40 34,31" fill="none" stroke="#12a26e" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="29.5,30.5 34,31 33.8,35.6" fill="none" stroke="#12a26e" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-lg font-extrabold tracking-tight", inverted ? "text-white" : "text-navy-900")}>
        CONTROLE <span className={inverted ? "text-money-400" : "text-money-500"}>FÁCIL</span>
      </span>
    </span>
  );
}

export const SLOGAN = "Seu dinheiro organizado, sua vida mais tranquila.";
