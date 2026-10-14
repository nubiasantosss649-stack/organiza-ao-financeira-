import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="text-center">
      <h1 className="text-xl font-bold text-navy-900">Link inválido ou expirado</h1>
      <p className="mt-2 text-sm text-slate-600">
        O link que você usou não é mais válido. Links de confirmação e de recuperação expiram por segurança.
      </p>
      <div className="mt-6 flex flex-col gap-2 text-sm font-semibold">
        <Link href="/recuperar-senha" className="text-navy-600 hover:underline">Solicitar nova recuperação de senha</Link>
        <Link href="/entrar" className="text-navy-600 hover:underline">Voltar para o login</Link>
      </div>
    </div>
  );
}
