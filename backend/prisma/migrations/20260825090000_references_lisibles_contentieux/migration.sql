-- Renomme les références de dossiers contentieux existantes (cuid) au format
-- lisible « CONT-AAAA-NNNN », numérotées par année dans l'ordre de création.
-- Idempotent : ne touche que les références qui ne sont pas déjà au bon format.
WITH ranked AS (
  SELECT
    id,
    to_char("createdAt", 'YYYY') AS yr,
    row_number() OVER (
      PARTITION BY to_char("createdAt", 'YYYY')
      ORDER BY "createdAt", id
    ) AS seq
  FROM "DossierContentieux"
  WHERE reference NOT LIKE 'CONT-%'
)
UPDATE "DossierContentieux" d
SET reference = 'CONT-' || r.yr || '-' || lpad(r.seq::text, 4, '0')
FROM ranked r
WHERE d.id = r.id;
