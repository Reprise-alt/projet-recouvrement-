import { useState } from 'react';
import { Building2, ChevronRight, MailCheck, ScrollText, SlidersHorizontal, Store, Users } from 'lucide-react';
import { IS_SAAS } from '../auth/mode';
import { FicheEntreprise } from './FicheEntreprise';
import { SettingsModal } from './SettingsModal';
import { ModelesRelancePanel } from './ModelesRelancePanel';
import { UsersPanel } from './UsersPanel';
import { EntreprisesPanel } from './EntreprisesPanel';
import { DeliverabilityPanel } from './DeliverabilityPanel';

// Hub « Paramètres entreprise » : regroupe tous les écrans de configuration
// (fiche, paliers, modèles, utilisateurs, entités, délivrabilité) derrière une
// seule entrée du rail Administration. Chaque item ouvre l'écran correspondant.
type Sous = 'fiche' | 'paliers' | 'modeles' | 'users' | 'entreprises' | 'deliverabilite' | null;

export function ParametresEntreprisePanel({
  onClose,
  onSaved,
  onEntreprisesChanged,
  domaineInitial,
  canMultiEntites,
}: {
  onClose: () => void;
  onSaved: () => void;
  onEntreprisesChanged: () => void;
  domaineInitial?: string | null;
  canMultiEntites?: boolean;
}) {
  const [sous, setSous] = useState<Sous>(null);
  const retour = () => setSous(null);

  const items: { id: Sous; label: string; desc: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'fiche', label: 'Fiche entreprise', desc: 'Identité, identifiants fiscaux, logo, moyens de paiement.', icon: <Building2 size={18} />, show: IS_SAAS },
    { id: 'paliers', label: 'Paramètres des paliers', desc: "Seuils en jours et échelle de l'escalade des relances.", icon: <SlidersHorizontal size={18} />, show: true },
    { id: 'modeles', label: 'Modèles de relance', desc: 'Textes des emails envoyés à chaque palier.', icon: <ScrollText size={18} />, show: true },
    { id: 'users', label: 'Utilisateurs', desc: "Comptes et rôles de votre équipe.", icon: <Users size={18} />, show: true },
    { id: 'entreprises', label: 'Entités / entreprises', desc: 'Gestion multi-entités.', icon: <Store size={18} />, show: !!canMultiEntites },
    { id: 'deliverabilite', label: 'Délivrabilité e-mail', desc: 'Vérifiez SPF / DKIM / DMARC de votre domaine.', icon: <MailCheck size={18} />, show: IS_SAAS },
  ];

  return (
    <>
      <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ width: 'min(560px, 96%)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <SlidersHorizontal size={20} style={{ color: 'var(--accent)' }} /> Paramètres entreprise
          </h2>
          <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
            Toute la configuration de votre espace, au même endroit.
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {items.filter((i) => i.show).map((i) => (
              <button
                key={i.id}
                onClick={() => setSous(i.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface, #fff)' }}
              >
                <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{i.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginTop: 1 }}>{i.desc}</span>
                </span>
                <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flex: 'none' }} />
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>

      {sous === 'fiche' && <FicheEntreprise onClose={retour} onSaved={onSaved} />}
      {sous === 'paliers' && <SettingsModal onClose={retour} onSaved={onSaved} />}
      {sous === 'modeles' && <ModelesRelancePanel onClose={retour} />}
      {sous === 'users' && <UsersPanel onClose={retour} />}
      {sous === 'entreprises' && <EntreprisesPanel onClose={retour} onChanged={onEntreprisesChanged} />}
      {sous === 'deliverabilite' && <DeliverabilityPanel onClose={retour} domaineInitial={domaineInitial} />}
    </>
  );
}
