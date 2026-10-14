import Link from "next/link";
import { Logo, SLOGAN } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/site";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label="Controle Fácil — início"><Logo /></Link>
          <nav className="flex items-center gap-2">
            <Link href="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50">Entrar</Link>
            <ButtonLink href="/cadastro" variant="money" size="sm">Criar conta grátis</ButtonLink>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="bg-navy-950 text-navy-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <Logo inverted />
            <p className="mt-3 text-sm text-navy-100/70">{SLOGAN}</p>
          </div>
          <nav aria-label="Links legais" className="flex flex-col gap-2 text-sm">
            <Link href="/privacidade" className="hover:text-white">Política de Privacidade</Link>
            <Link href="/termos" className="hover:text-white">Termos de Uso</Link>
            <Link href="/#planos" className="hover:text-white">Planos</Link>
          </nav>
          <div className="text-sm">
            <p className="font-semibold text-white">Suporte</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block hover:text-white">{SUPPORT_EMAIL}</a>
          </div>
        </div>
        <p className="border-t border-white/10 py-4 text-center text-xs text-navy-100/50">© {new Date().getFullYear()} Controle Fácil. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
