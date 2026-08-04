-- AlterTable
ALTER TABLE "ActionRecouvrement" ADD COLUMN     "utilisateurId" TEXT;

-- AddForeignKey
ALTER TABLE "ActionRecouvrement" ADD CONSTRAINT "ActionRecouvrement_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
