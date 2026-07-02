import { leadsRepo, type Lead } from "./db";

// Pure persistence: writes leads in batches so the UI never blocks, even for
// very large files. Knows nothing about CSV parsing or planning.
// Returns the number of leads written in this run (may be lower if cancelled).
export async function runImport(
  leads: Lead[],
  opts: {
    batchSize?: number;
    onProgress?: (imported: number, currentLabel: string) => void;
    isCancelled?: () => boolean;
  } = {}
): Promise<number> {
  const { batchSize = 200, onProgress, isCancelled } = opts;
  let imported = 0;

  while (imported < leads.length) {
    if (isCancelled?.()) return imported;
    const batch = leads.slice(imported, imported + batchSize);
    await leadsRepo.addMany(batch);
    imported += batch.length;
    const last = batch[batch.length - 1];
    onProgress?.(imported, last.email || last.fullName || last.company || "");
    // Yield to the event loop so the progress UI can paint.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return imported;
}
