import { expandGlob } from "@std/fs/expand-glob";
import { relative } from "@std/path/relative";
import { resolve } from "@std/path/resolve";
import { ensureFile } from "@std/fs";
import task from "tasuku";

import { Transaction } from "./transaction.ts";
import type { Config } from "../config.ts";
import { generateWorkbook } from "./consolidate/workbook.ts";

function deduplicateTransactions(
  fileTransactionsMap: Map<string, Transaction[]>,
): Transaction[] {
  // Key: transactionKey, Value: Set of filePaths where seen
  const uniqueTransactions = new Map<string, Set<string>>();
  const deduplicatedTransactions: Transaction[] = [];

  for (const [filePath, transactions] of fileTransactionsMap.entries()) {
    for (const transaction of transactions.filter((t) => !t.isPending)) {
      const { date, description, account } = transaction;

      const transactionKey =
        `${account}\x1F${date.toString()}\x1F${description}}`;

      const seenFilePaths = uniqueTransactions.get(transactionKey);
      if (!seenFilePaths) {
        // First time seeing this transaction key, initialize file path set
        uniqueTransactions.set(transactionKey, new Set([filePath]));
        deduplicatedTransactions.push(transaction);
      } else {
        // Transaction key already exists
        if (!seenFilePaths.has(filePath)) {
          seenFilePaths.add(filePath); // Add current file path to the set
          // Don't add this transaction because it was already added from a different file
        } else {
          // Transaction with this key already seen in the *same* file path
          // We don't need to deduplicate
          deduplicatedTransactions.push(transaction);
        }
      }
    }
  }

  return deduplicatedTransactions.sort((a, b) =>
    Temporal.PlainDate.compare(a.date, b.date)
  ); // Sort by date
}

function parseArtifact(artifactText: string): Transaction[] {
  const { transactions } = JSON.parse(artifactText, Transaction.reviver);
  return transactions;
}

async function processArtifacts(paths: string[]) {
  const transactionsByFile = new Map<string, Transaction[]>();
  for await (const path of paths) {
    const artifactText = await Deno.readTextFile(path);
    transactionsByFile.set(path, parseArtifact(artifactText));
  }

  return deduplicateTransactions(transactionsByFile);
}

export async function executeConsolidation(config: Config) {
  const { outputPath, consolidatedPath, rulesPath } = config;
  const artifacts = await Array.fromAsync(
    expandGlob(`${outputPath}/*/output.json`),
  );
  const paths = artifacts.map((a) => relative(Deno.cwd(), a.path));
  const deduplicatedTransactions = await processArtifacts(paths);

  const outJsonPath = resolve(consolidatedPath, "consolidated.json");
  const outCsvPath = resolve(consolidatedPath, "consolidated.csv");
  const outXlsxPath = resolve(consolidatedPath, "consolidated.xlsx");

  // Consolidated JSON
  await task("Generating consolidated.json", async () => {
    await ensureFile(outJsonPath);
    await Deno.writeTextFile(
      outJsonPath,
      JSON.stringify(
        {
          updatedAt: Temporal.Now.zonedDateTimeISO().toString({
            timeZoneName: "never",
          }),
          transactions: deduplicatedTransactions,
        },
        null,
        2,
      ),
    );
  });

  // Consolidated CSV
  await task("Generating consolidated.csv", async () => {
    await ensureFile(outCsvPath);
    using outCsv = await Deno.open(outCsvPath, { write: true });
    await Transaction.toCsvStream(deduplicatedTransactions)
      .pipeThrough(new TextEncoderStream())
      .pipeTo(outCsv.writable);
  });

  // Consolidated XLSX
  await task("Generating consolidated.xlsx", async () => {
    await ensureFile(outXlsxPath);
    const rules = await Deno.readTextFile(rulesPath);
    const xlsxU8 = generateWorkbook(deduplicatedTransactions, rules);
    await Deno.writeFile(outXlsxPath, xlsxU8);
  });
}
