import { expandGlob } from "@std/fs";
import { join, resolve } from "@std/path";

import type { Config } from "../config.ts";
import { logger } from "../logger.ts";
import { Transaction, type TransactionMeta } from "./transaction.ts";
import { loadManualMap, generateWorkbook } from "./consolidate/workbook.ts";
import { deduplicateTransactions } from "./consolidate/deduplicate.ts";
import { writeFile } from "./lib.ts";
import { getRuleMapperFromPath } from "./consolidate/rules.ts";
import { getTransactionMeta } from "./driver.ts";

export interface EnrichedTransaction extends Transaction {
  meta: TransactionMeta;
  category: string;
  originalCategory: string;
}

function applyManualMap(
  manualMap: Map<string, string>,
  t: EnrichedTransaction,
  fallback: string,
): string {
  const { meta } = t;
  let category = fallback;
  if (meta.payeeName && manualMap.has(meta.payeeName)) {
    category = manualMap.get(meta.payeeName) || "";
  }
  if (meta.displayText && manualMap.has(meta.displayText)) {
    category = manualMap.get(meta.displayText) || "";
  }
  return category;
}

export function enrichTransactions(
  transactions: Transaction[],
  rulesMapper: (t: Transaction) => string,
  manualMap: Map<string, string>,
): EnrichedTransaction[] {
  for (const transaction of transactions) {
    const enrichedTransaction = transaction as EnrichedTransaction; // same object
    const meta = getTransactionMeta(transaction);
    enrichedTransaction.meta = meta;

    // Compute category
    let category = rulesMapper(transaction);
    enrichedTransaction.originalCategory = category;

    category = applyManualMap(manualMap, enrichedTransaction, category);
    enrichedTransaction.category = category;
  }

  return transactions as EnrichedTransaction[];
}

async function processArtifactsGlob(glob: string): Promise<Transaction[]> {
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
  const manualMap = await loadManualMap(xlsx);

  const outJsonPath = resolve(consolidatedPath, "consolidated.json");
  const outXlsxPath = resolve(consolidatedPath, xlsx);
  const enrichedTransactions = enrichTransactions(
    deduplicatedTransactions,
    rulesMapper,
    manualMap,
  );

  // Consolidated JSON
  logger.info("Generating consolidated.json");
  const consolidatedObject = {
    updatedAt: Temporal.Now.zonedDateTimeISO().toString({
      timeZoneName: "never",
    }),
    transactions: enrichedTransactions,
  };
  await writeFile(outJsonPath, JSON.stringify(consolidatedObject, null, 2));

  // Consolidated XLSX
  logger.info("Generating consolidated.xlsx");
  const workbook = generateWorkbook(enrichedTransactions, manualMap);
  await Deno.truncate(outXlsxPath);
  await writeFile(outXlsxPath, workbook);
}
