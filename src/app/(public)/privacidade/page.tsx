import type { Metadata } from "next";
import { LegalPage } from "@/components/brand/legal-page";
import { COMPANY_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="13/10/2026">
      <p>
        Esta Política explica como o {COMPANY_NAME} (“nós”) trata os dados pessoais de quem usa o aplicativo Controle Fácil,
        em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail e senha (a senha é armazenada de forma protegida pelo provedor de autenticação; não temos acesso a ela).</li>
        <li><strong>Dados financeiros que você registra:</strong> contas, saldos iniciais, receitas, despesas, categorias, orçamentos e metas.</li>
        <li><strong>Dados técnicos:</strong> registros de acesso necessários à segurança (como data, hora e endereço IP), mantidos pelo período exigido pelo Marco Civil da Internet.</li>
      </ul>
      <p>Não pedimos senhas de banco e não nos conectamos às suas contas bancárias.</p>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço: calcular saldos, gráficos, orçamentos e metas (execução de contrato).</li>
        <li>Enviar e-mails essenciais, como confirmação de cadastro e recuperação de senha.</li>
        <li>Manter a segurança, prevenir fraudes e cumprir obrigações legais.</li>
        <li>Recursos de inteligência artificial (plano Pro): somente quando você solicitar uma análise, usando apenas os seus dados.</li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade de terceiros.</p>

      <h2>3. Com quem compartilhamos</h2>
      <p>Somente com fornecedores necessários ao funcionamento do serviço, que atuam como operadores sob contrato:</p>
      <ul>
        <li>Infraestrutura de banco de dados e autenticação (Supabase) e hospedagem do aplicativo.</li>
        <li>Processador de pagamentos (quando você assinar o Pro), que recebe apenas os dados necessários à cobrança.</li>
        <li>Provedor de inteligência artificial (quando você solicitar uma análise), sem uso dos dados para treinar modelos, conforme contrato com o provedor.</li>
      </ul>

      <h2>4. Segurança</h2>
      <p>
        Usamos conexões criptografadas (HTTPS), controle de acesso por usuário aplicado diretamente no banco de dados e acesso administrativo
        restrito. Nossa equipe não consulta seus lançamentos financeiros individuais.
      </p>

      <h2>5. Seus direitos</h2>
      <p>Você pode, a qualquer momento, pelo próprio aplicativo (Meu perfil) ou pelo e-mail de suporte:</p>
      <ul>
        <li>Acessar e exportar seus dados (CSV ou JSON);</li>
        <li>Corrigir seus dados cadastrais;</li>
        <li>Excluir sua conta e todos os dados financeiros associados;</li>
        <li>Revogar consentimentos e obter informações sobre compartilhamento.</li>
      </ul>

      <h2>6. Retenção</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa. Ao excluir a conta, os dados financeiros são apagados imediatamente.
        Registros de pagamento e de acesso podem ser mantidos pelo prazo exigido em lei.
      </p>

      <h2>7. Cookies</h2>
      <p>Usamos apenas cookies essenciais para manter você conectado com segurança. Não usamos cookies de publicidade.</p>

      <h2>8. Contato e encarregado (DPO)</h2>
      <p>Dúvidas ou solicitações: <a className="font-medium text-navy-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>

      <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700">
        Documento-base elaborado para o lançamento. Recomendamos revisão por profissional jurídico e inclusão da razão social e CNPJ do controlador antes da publicação em produção.
      </p>
    </LegalPage>
  );
}
