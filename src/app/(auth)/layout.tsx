import Link from "next/link";
import { Logo, SLOGAN } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-navy-900 via-navy-900 to-navy-800 px-4 py-8">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <Link href="/" className="mx-auto mb-2 rounded-lg focus-visible:outline-2 focus-visible:outline-money-400">
          <Logo inverted />
        </Link>
        <p className="mb-6 text-center text-sm text-navy-100/80">{SLOGAN}</p>
        <main className="card p-6 sm:p-8">{children}</main>
        <p className="mt-6 text-center text-xs text-navy-100/70">
          <Link href="/termos" className="underline-offset-2 hover:underline">Termos de Uso</Link>
          {" · "}
          <Link href="/privacidade" className="underline-offset-2 hover:underline">Política de Privacidade</Link>
        </p>
      </div>
    </div>
  );
}
