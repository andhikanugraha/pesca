import { exists, expandGlob } from "@std/fs";
import { join, relative, resolve } from "@std/path";

import type { Config } from "../config.ts";
import { logger } from "../logger.ts";
import { Transaction } from "./transaction.ts";
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
import { selectDriver } from "./driver.ts";

export interface EnrichedTransaction extends DeduplicatedTransaction {
  category: string;
  originalCategory: string;
  notes: string;
}

function applyManualMap(
  manualMap: Map<string, string>,
  transaction: Transaction,
  fallback: string,
): string {
  let category = fallback;
  if (transaction.payeeName && manualMap.has(transaction.payeeName)) {
    category = manualMap.get(transaction.payeeName) || "";
  }
  if (transaction.displayText && manualMap.has(transaction.displayText)) {
    category = manualMap.get(transaction.displayText) || "";
  }
  return category;
}

export async function* enrichTransactions(
  transactions: AsyncIterable<DeduplicatedTransaction>,
  rulesMapper: (t: Transaction) => string,
  manualMap: Map<string, string>,
  notesMap: Map<string, RowWithNotes>,
): AsyncGenerator<EnrichedTransaction> {
  for await (const transaction of transactions) {
    // Compute category
    let category = rulesMapper(transaction);
    const originalCategory = category;

    category = applyManualMap(manualMap, transaction, category);
    const notes = notesMap.get(transaction.id)?.notes || "";

    const enriched = Object.assign(transaction, {
      category,
      originalCategory,
      notes,
    });
    yield enriched;
  }
}

export async function* loadArtifactFiles(parentPath: string) {
  for await (
    const entry of expandGlob(join(parentPath, "**"), { includeDirs: false })
  ) {
    if (entry.name.startsWith(".")) continue;

    const name = relative(parentPath, entry.path);
    using file = await Deno.open(entry.path);
    yield { name, readable: file.readable };
  }
}

export async function* parseJobArtifacts(
  { sources, outputPath }: Config,
  jobDirName: string,
): AsyncGenerator<Transaction> {
  logger.info(`Parsing artifacts in ${jobDirName}`);
  for (const source of sources) {
    const sourcePath = join(outputPath, jobDirName, source.key);
    if (!await exists(sourcePath, { isDirectory: true })) {
      continue;
    }

    const driver = selectDriver(source);
    if (!driver || !driver.parseArtifacts) {
      continue;
    }

    yield* driver.parseArtifacts(
      { source, logger },
      loadArtifactFiles(sourcePath),
    );
  }
}

export async function* processAllArtifacts(config: Config) {
  const transactionsByFile = new Map<string, AsyncIterable<Transaction>>();
  for await (const entry of Deno.readDir(config.outputPath)) {
    if (!entry.isDirectory) continue;
    const transactions = parseJobArtifacts(config, entry.name);
    transactionsByFile.set(entry.name, transactions);
  }

  yield* deduplicateTransactions(transactionsByFile);
}

export async function executeConsolidation(config: Config) {
  const { rulesPath, consolidatedPath, xlsx } = config;

  const rulesMapper = await getRuleMapperFromPath(rulesPath);

  const xlsxPath = resolve(consolidatedPath, xlsx);
  const { payeeToCategory, notes } = await loadEdits(xlsxPath);

  const outJsonPath = resolve(consolidatedPath, "consolidated.json");
  const enrichedTransactions = enrichTransactions(
    processAllArtifacts(config),
    rulesMapper,
    payeeToCategory,
    notes,
  );

  const transactions = (await Array.fromAsync(enrichedTransactions))
    .sort(Transaction.sort);

  // Consolidated JSON
  logger.info("Generating consolidated.json");
  const consolidatedObject = {
    updatedAt: Temporal.Now.zonedDateTimeISO().toString({
      timeZoneName: "never",
    }),
    transactions,
  };
  await writeFile(
    outJsonPath,
    JSON.stringify(consolidatedObject, null, 2),
    true,
  );

  // Consolidated XLSX
  logger.info("Generating consolidated.xlsx");
  const workbook = generateWorkbook(
    transactions,
    payeeToCategory,
    notes,
  );

  await Deno.truncate(xlsxPath);
  await writeFile(xlsxPath, workbook, true);
}
