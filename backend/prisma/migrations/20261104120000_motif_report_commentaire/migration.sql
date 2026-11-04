-- Justification libre obligatoire d'un report de course (en plus du motif imposé).
-- Demande ADV : aucun report « silencieux » -- le coursier doit expliquer par écrit.
-- NULL tant que la tâche n'a jamais été reportée (rétro-compatible avec l'existant).
ALTER TABLE "TacheCoursier" ADD COLUMN "motifReportCommentaire" TEXT;
