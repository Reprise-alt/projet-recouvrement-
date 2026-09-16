// Abstraction d'envoi d'email transactionnel (addendum §2.3). Le vrai
// fournisseur (SMTP / Resend / SendGrid…) s'implémente derrière cette interface
// et se sélectionne par la variable EMAIL_PROVIDER — à trancher (§17). Seul un
// émetteur « stub » (journalisation, aucun envoi) est fourni à ce stade, suffisant
// pour le développement et les tests de bout en bout.
export interface EmailProvider {
  sendOtp(to: string, code: string): Promise<void>;
}

class StubEmailProvider implements EmailProvider {
  async sendOtp(to: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email:stub] Code de connexion OLU 360 pour ${to} : ${code}`);
  }
}

let instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  switch (process.env.EMAIL_PROVIDER) {
    // case 'smtp': instance = new SmtpEmailProvider(); break;   // à implémenter
    default:
      instance = new StubEmailProvider();
  }
  return instance;
}

// Pour les tests : permet d'injecter un émetteur espion.
export function setEmailProvider(p: EmailProvider | null): void {
  instance = p;
}
