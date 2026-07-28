import { prisma } from '../db';
import { DEFAULT_CONFIG, PalierConfig } from '../lib/paliers';

export async function getConfig(): Promise<PalierConfig> {
  const existing = await prisma.config.findUnique({ where: { id: 1 } });
  if (existing) {
    const { j1, j2, j3, j4, j5, j6, j7 } = existing;
    return { j1, j2, j3, j4, j5, j6, j7 };
  }
  const created = await prisma.config.create({ data: { id: 1, ...DEFAULT_CONFIG } });
  const { j1, j2, j3, j4, j5, j6, j7 } = created;
  return { j1, j2, j3, j4, j5, j6, j7 };
}

export async function updateConfig(patch: Partial<PalierConfig>): Promise<PalierConfig> {
  const current = await getConfig();
  const next = { ...current, ...patch };
  const updated = await prisma.config.upsert({
    where: { id: 1 },
    create: { id: 1, ...next },
    update: next,
  });
  const { j1, j2, j3, j4, j5, j6, j7 } = updated;
  return { j1, j2, j3, j4, j5, j6, j7 };
}
