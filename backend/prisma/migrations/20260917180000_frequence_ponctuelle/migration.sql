-- Nouvelle fréquence de facturation « ponctuelle » (one-shot) : pour les
-- activités qui facturent à l'acte, sans cycle récurrent. Le multiplicateur de
-- paliers vaut 1 (l'échéance fait foi). ADD VALUE seul dans sa migration : la
-- valeur n'est pas utilisée dans la même transaction, donc sûr en Postgres 12+.
ALTER TYPE "FrequenceFacturation" ADD VALUE IF NOT EXISTS 'ponctuelle';
