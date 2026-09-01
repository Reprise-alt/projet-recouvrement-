-- Palier « Avis d'échéance » (j0) : premier e-mail courtois dès l'échéance.

-- 1) Nouveau seuil configurable j0 (défaut : 1 jour après l'échéance).
ALTER TABLE "Config" ADD COLUMN "j0" INTEGER NOT NULL DEFAULT 1;

-- 2) Renumérotation de l'échelle : l'« Avis d'échéance » devient le palier 1.
--    Toutes les actions de relance déjà enregistrées (palier >= 1) sont
--    décalées de +1 pour conserver leur sens d'origine :
--      Relance 1 -> 2, Relance 2 -> 3, Relance 3 -> 4, Arrêt de service -> 5,
--      Pénalités -> 6, Commandement -> 7, Contentieux -> 8.
--    Les actions au palier 0 (tenue de dossier, hors échelle de relance)
--    restent inchangées.
--    Réversible : UPDATE "ActionRecouvrement" SET "palier" = "palier" - 1 WHERE "palier" >= 2;
UPDATE "ActionRecouvrement" SET "palier" = "palier" + 1 WHERE "palier" >= 1;
