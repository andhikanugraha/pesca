import { expandGlob } from "@std/fs";
import { join, resolve } from "@std/path";

import type { Config } from "../config.ts";
import { logger } from "../logger.ts";
import { Transaction, type TransactionMeta } from "./transaction.ts";
import {
  generateWorkbook,
  loadEdits,
  type RowWithNotes,
} from "./consolidate/workbook.ts";
import {
  type DeduplicatedTransaction,
  deduplicateTransactions,
} from "./consolidate/deduplicate.ts";
import { writeFile } from "./lib.ts";
import { getRuleMapperFromPath } from "./consolidate/rules.ts";
import { getTransactionMeta } from "./driver.ts";

export interface EnrichedTransaction extends DeduplicatedTransaction {
  meta: TransactionMeta;
  category: string;
  originalCategory: string;
  notes: string;
}

function applyManualMap(
  manualMap: Map<string, string>,
  meta: TransactionMeta,
  fallback: string,
): string {
  let category = fallback;
  if (meta.payeeName && manualMap.has(meta.payeeName)) {
    category = manualMap.get(meta.payeeName) || "";
  }
  if (meta.displayText && manualMap.has(meta.displayText)) {
    category = manualMap.get(meta.displayText) || "";
  }
  return category;
}

export function* enrichTransactions(
  transactions: Iterable<DeduplicatedTransaction>,
  rulesMapper: (t: Transaction) => string,
  manualMap: Map<string, string>,
  notesMap: Map<string, RowWithNotes>,
): Generator<EnrichedTransaction> {
  for (const transaction of transactions) {
    const meta = getTransactionMeta(transaction);

    // Compute category
    let category = rulesMapper(transaction);
    const originalCategory = category;

    category = applyManualMap(manualMap, meta, category);
    const notes = notesMap.get(transaction.id)?.notes || "";

    Object.assign(transaction, { meta, category, originalCategory, notes });
    yield transaction as EnrichedTransaction;
  }
}

async function processArtifactsGlob(
  glob: string,
): Promise<Iterable<DeduplicatedTransaction>> {
  const transactionsByFile = new Map<string, Transaction[]>();
  const entries = expandGlob(glob);
  for await (const entry of entries) {
    const { path } = entry;
    const artifactText = await Deno.readTextFile(path);
    const { transactions } = JSON.parse(artifactText, Transaction.reviver);
    transactionsByFile.set(path, transactions);
  }

  return deduplicateTransactions(transactionsByFile);
}

export async function executeConsolidation(config: Config) {
  const { rulesPath, outputPath, consolidatedPath, xlsx } = config;
  const deduplicatedTransactions = await processArtifactsGlob(
    join(outputPath, "*", "output.json"),
  );

  const rulesMapper = await getRuleMapperFromPath(rulesPath);
  const { payeeToCategory, notes } = await loadEdits(xlsx);

  const outJsonPath = resolve(consolidatedPath, "consolidated.json");
  const outXlsxPath = resolve(consolidatedPath, xlsx);
  const enrichedTransactions = enrichTransactions(
    deduplicatedTransactions,
    rulesMapper,
    payeeToCategory,
    notes,
  );

  const transactions = [...enrichedTransactions].sort(Transaction.sort);

  // Consolidated JSON
  logger.info("Generating consolidated.json");
  const consolidatedObject = {
    updatedAt: Temporal.Now.zonedDateTimeISO().toString({
      timeZoneName: "never",
    }),
    transactions,
  };
  await writeFile(outJsonPath, JSON.stringify(consolidatedObject, null, 2), true);

  // Consolidated XLSX
  logger.info("Generating consolidated.xlsx");
  const workbook = generateWorkbook(
    transactions,
    payeeToCategory,
    notes,
  );
  // await copyForBackup(outJsonPath);
  await Deno.truncate(outXlsxPath);
  await writeFile(outXlsxPath, workbook, true);
}
