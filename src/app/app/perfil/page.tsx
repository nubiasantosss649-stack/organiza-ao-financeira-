import type { Metadata } from "next";
import Link from "next/link";
import { Download, LogOut, ShieldCheck } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteAccountForm, PasswordForm, ProfileForm, SignOutOthersForm } from "./forms";
import { signOutEverywhere } from "./actions";
import { getEntitlements, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const [user, ent] = await Promise.all([requireUser(), getEntitlements()]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Meu perfil" description="Seus dados, segurança e privacidade." />

      <Card>
        <CardHeader title="Dados pessoais" />
        <ProfileForm fullName={user.fullName ?? ""} email={user.email} />
      </Card>

      <Card>
        <CardHeader title="Plano" description={ent.plan_name} action={<Link href="/app/planos" className="text-sm font-semibold text-navy-600 hover:underline">Ver planos</Link>} />
        <p className="text-sm text-slate-600">
          {ent.plan_id === "free"
            ? "Você usa o plano Grátis, sem prazo de expiração."
            : "Obrigado por apoiar o Controle Fácil!"}
        </p>
      </Card>

      <Card>
        <CardHeader title="Senha" />
        <PasswordForm />
      </Card>

      <Card>
        <CardHeader title="Sessões" description="Encerre o acesso em outros celulares e computadores." />
        <div className="flex flex-wrap items-start gap-3">
          <SignOutOthersForm />
          <form action={signOutEverywhere}>
            <Button variant="ghost" size="sm"><LogOut className="h-4 w-4" aria-hidden /> Sair de todos os dispositivos</Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Seus dados (LGPD)" description="Você pode baixar uma cópia de tudo o que registrou." />
        <div className="flex flex-wrap gap-2">
          <a href="/api/exportar?formato=csv" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden /> Lançamentos (CSV para Excel)
          </a>
          <a href="/api/exportar?formato=json" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden /> Todos os dados (JSON)
          </a>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          Seus dados financeiros são acessíveis apenas por você. Veja a <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
      </Card>

      <Card className="border-danger-100">
        <CardHeader title="Excluir conta" description="Apaga permanentemente sua conta e todos os seus dados financeiros. Não é possível desfazer." />
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-danger-700">Quero excluir minha conta</summary>
          <div className="mt-4">
            <p className="mb-4 text-sm text-slate-600">Recomendamos exportar seus dados antes. Após a exclusão, os registros não poderão ser recuperados.</p>
            <DeleteAccountForm />
          </div>
        </details>
      </Card>
    </div>
  );
}
