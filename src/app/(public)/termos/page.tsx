import type { Metadata } from "next";
import { LegalPage } from "@/components/brand/legal-page";
import { COMPANY_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updated="13/10/2026">
      <p>Ao criar uma conta no Controle Fácil, você concorda com estes Termos. Leia com atenção.</p>

      <h2>1. O serviço</h2>
      <p>
        O Controle Fácil é uma ferramenta de organização financeira pessoal. As informações exibidas dependem dos dados que você registra.
        O aplicativo não é instituição financeira, não movimenta dinheiro, não realiza pagamentos e não oferece recomendação de investimentos.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você é responsável por manter sua senha em sigilo e pelas informações que registra.</li>
        <li>É necessário ter 18 anos ou mais, ou autorização do responsável legal.</li>
        <li>Você pode encerrar sua conta a qualquer momento em Meu perfil.</li>
      </ul>

      <h2>3. Planos</h2>
      <ul>
        <li><strong>Controle Fácil Grátis:</strong> R$ 0,00, sem prazo de expiração, com os limites descritos na página de planos.</li>
        <li><strong>Controle Fácil Pro:</strong> assinatura mensal com o preço exibido no momento da contratação, renovada automaticamente até o cancelamento.</li>
        <li>O cancelamento pode ser feito a qualquer momento no aplicativo. O acesso Pro continua até o fim do período já pago; depois, a conta volta ao plano Grátis sem exclusão dos dados registrados.</li>
        <li>Alterações de preço serão comunicadas com antecedência e não afetam o período já pago.</li>
        <li>Para contratações online, você pode exercer o direito de arrependimento em até 7 dias da primeira contratação (art. 49 do Código de Defesa do Consumidor).</li>
      </ul>

      <h2>4. Simulações e inteligência artificial</h2>
      <p>
        Simulações, projeções e análises por inteligência artificial são estimativas baseadas nos seus dados e nas hipóteses informadas em cada tela.
        Não constituem garantia de resultado nem aconselhamento financeiro profissional.
      </p>

      <h2>5. Uso adequado</h2>
      <p>É proibido usar o serviço para fins ilícitos, tentar acessar dados de outras pessoas ou comprometer a segurança do sistema.</p>

      <h2>6. Disponibilidade</h2>
      <p>Trabalhamos para manter o serviço disponível, mas podem ocorrer interrupções para manutenção ou por fatores externos. O aplicativo precisa de conexão com a internet.</p>

      <h2>7. Contato</h2>
      <p>{COMPANY_NAME} — <a className="font-medium text-navy-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>

      <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700">
        Documento-base elaborado para o lançamento. Recomendamos revisão por profissional jurídico antes da publicação em produção.
      </p>
    </LegalPage>
  );
}
