import { resolveTxt, resolveMx } from 'dns/promises';

// Vérificateur de délivrabilité e-mail : interroge le DNS d'un domaine pour son
// SPF, son DMARC, une trace de DKIM et ses MX. Pur diagnostic (aucune écriture),
// pour aider un client à configurer son domaine et rassurer en démo. Chaque
// requête est bornée dans le temps pour ne jamais bloquer l'endpoint.

const LOOKUP_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS)),
  ]);
}

// Sélecteurs DKIM les plus courants (le sélecteur dépend du fournisseur d'envoi ;
// on en sonde une poignée, on signale ceux trouvés).
const DKIM_SELECTORS = ['resend', 'google', 'selector1', 'selector2', 'default', 'dkim', 'mail', 'k1', 's1', 's2', 'mandrill', 'smtp'];

export type Etat = 'ok' | 'attention' | 'absent';

export interface DeliverabilityReport {
  domain: string;
  spf: { etat: Etat; record: string | null; detail: string };
  dmarc: { etat: Etat; record: string | null; politique: string | null; detail: string };
  dkim: { etat: Etat; selecteurs: string[]; detail: string };
  mx: { present: boolean; hotes: string[]; fournisseur: string | null };
  resume: { etat: Etat; message: string };
}

function normaliserDomaine(input: string): string | null {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return null;
  // Accepte une adresse email ou une URL : on garde le domaine.
  if (d.includes('@')) d = d.split('@')[1];
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

async function txt(name: string): Promise<string[]> {
  // resolveTxt renvoie des tableaux de fragments à concaténer.
  const rec = await withTimeout(resolveTxt(name), [] as string[][]);
  return rec.map((parts) => parts.join(''));
}

function detectFournisseur(hotes: string[]): string | null {
  const h = hotes.join(' ').toLowerCase();
  if (h.includes('google') || h.includes('googlemail')) return 'Google Workspace';
  if (h.includes('outlook') || h.includes('microsoft') || h.includes('office365')) return 'Microsoft 365';
  if (h.includes('zoho')) return 'Zoho';
  if (h.includes('ovh')) return 'OVH';
  if (h.includes('yandex')) return 'Yandex';
  if (h.includes('protonmail') || h.includes('proton.me')) return 'Proton';
  return null;
}

export async function verifierDelivrabilite(input: string): Promise<DeliverabilityReport | null> {
  const domain = normaliserDomaine(input);
  if (!domain) return null;

  const [txtRoot, txtDmarc, mx, ...dkimResults] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    withTimeout(resolveMx(domain), [] as { exchange: string; priority: number }[]),
    ...DKIM_SELECTORS.map((s) => txt(`${s}._domainkey.${domain}`).then((r) => ({ s, found: r.some((v) => /v=DKIM1|k=rsa|p=/i.test(v)) }))),
  ]);

  // SPF
  const spfRecord = txtRoot.find((r) => /^v=spf1/i.test(r.trim())) ?? null;
  const spf = spfRecord
    ? { etat: 'ok' as Etat, record: spfRecord, detail: 'Un enregistrement SPF est publié.' }
    : { etat: 'absent' as Etat, record: null, detail: 'Aucun enregistrement SPF trouvé. Ajoutez un TXT « v=spf1 … » sur votre domaine.' };

  // DMARC
  const dmarcRecord = txtDmarc.find((r) => /^v=DMARC1/i.test(r.trim())) ?? null;
  const politique = dmarcRecord ? (dmarcRecord.match(/p=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null) : null;
  let dmarc: DeliverabilityReport['dmarc'];
  if (!dmarcRecord) {
    dmarc = { etat: 'absent', record: null, politique: null, detail: 'Aucun DMARC. Ajoutez un TXT sur _dmarc avec au minimum « v=DMARC1; p=none ».' };
  } else if (politique === 'none' || politique === null) {
    dmarc = { etat: 'attention', record: dmarcRecord, politique, detail: 'DMARC présent mais en observation (p=none). Passez à quarantine puis reject une fois stabilisé.' };
  } else {
    dmarc = { etat: 'ok', record: dmarcRecord, politique, detail: `DMARC actif (p=${politique}).` };
  }

  // DKIM (sélecteurs sondés)
  const selecteurs = (dkimResults as { s: string; found: boolean }[]).filter((x) => x.found).map((x) => x.s);
  const dkim: DeliverabilityReport['dkim'] = selecteurs.length
    ? { etat: 'ok', selecteurs, detail: `Signature DKIM détectée (sélecteur${selecteurs.length > 1 ? 's' : ''} : ${selecteurs.join(', ')}).` }
    : { etat: 'attention', selecteurs: [], detail: 'Aucun sélecteur DKIM courant détecté. Le DKIM dépend de votre fournisseur d’envoi — vérifiez qu’il est activé.' };

  const hotes = (mx as { exchange: string }[]).map((m) => m.exchange);
  const mxOut = { present: hotes.length > 0, hotes, fournisseur: detectFournisseur(hotes) };

  // Résumé
  const etats = [spf.etat, dmarc.etat, dkim.etat];
  const resumeEtat: Etat = etats.includes('absent') ? 'absent' : etats.includes('attention') ? 'attention' : 'ok';
  const resumeMsg =
    resumeEtat === 'ok'
      ? 'Votre domaine est bien configuré pour la délivrabilité.'
      : resumeEtat === 'attention'
        ? 'Configuration correcte mais perfectible — quelques réglages renforceraient la délivrabilité.'
        : 'Des enregistrements manquent — vos emails risquent d’arriver en spam tant qu’ils ne sont pas ajoutés.';

  return { domain, spf, dmarc, dkim, mx: mxOut, resume: { etat: resumeEtat, message: resumeMsg } };
}
