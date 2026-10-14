import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-navy-900">Criar nova senha</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Ao salvar, as outras sessões abertas serão encerradas.</p>
      <ResetForm />
    </>
  );
}
