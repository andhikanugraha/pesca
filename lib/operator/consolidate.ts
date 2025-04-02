import { expandGlob } from "@std/fs/expand-glob";
import { relative } from "@std/path/relative";
import { resolve } from "@std/path/resolve";
import { ensureFile } from "@std/fs";
import task from "tasuku";

import { Transaction } from "./transaction.ts";
import type { Config } from "../config.ts";
import { writeWorkbooks } from "./consolidate/workbook.ts";
import { deduplicateTransactions } from "./consolidate/deduplicate.ts";

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
  const { outputPath, consolidatedPath, rulesPath, xlsx } = config;
  const artifacts = await Array.fromAsync(
    expandGlob(`${outputPath}/*/output.json`),
  );
  const paths = artifacts.map((a) => relative(Deno.cwd(), a.path));
  const deduplicatedTransactions = await processArtifacts(paths);

  const outJsonPath = resolve(consolidatedPath, "consolidated.json");
  const outCsvPath = resolve(consolidatedPath, "consolidated.csv");
  const outXlsxPath = resolve(consolidatedPath, xlsx);
  console.log(outXlsxPath);

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
    await writeWorkbooks(
      deduplicatedTransactions,
      rules,
      outXlsxPath,
    );
  });
}
