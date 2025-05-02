import type { FrameLocator, Page } from "playwright";
import type { Logger } from "pino";
import { copy, ensureFile, exists } from "@std/fs";
import type { SourceParams, UnresolvedSourceParams } from "../config.ts";
import { Transaction, type TransactionMeta } from "./transaction.ts";
import type { NotifyFn } from "./pushover.ts";
import { basename, dirname, join } from "@std/path";
import type { DisposablePage } from "./browser.ts";

export {
  type DisposablePage,
  type FrameLocator,
  type Logger,
  type NotifyFn,
  type Page,
  type SourceParams,
  Transaction,
  type TransactionMeta,
};

export interface ScraperParams {
  source: SourceParams;
  logger: Logger;
  createPage: () => Promise<DisposablePage>;
  storeArtifact: (name: string, contents: string | Uint8Array) => Promise<void>;
  notify: NotifyFn;
}

export type Scraper = (p: ScraperParams) => Promise<Transaction[]>;

export interface DriverDefinition {
  name: string;
  pull: (p: ScraperParams) => Promise<DriverOutput>;
  supportsSource: (p: UnresolvedSourceParams) => boolean;
  transactionMeta: (t: Transaction) => TransactionMeta;
}

export interface DriverOutput {
  transactions: Transaction[];
}

export function defineDriver(driver: DriverDefinition) {
  return driver;
}

export function parseFloatSafely(
  floatString: string,
  removeCommas = false,
): number {
  if (removeCommas) {
    floatString = floatString.replace(/,/g, "");
  }

  const asFloat = parseFloat(floatString);
  if (Number.isNaN(asFloat)) {
    return 0;
  } else {
    return asFloat;
  }
}

export async function copyForBackup(path: string) {
  if (!await exists(path)) return;

  const dir = dirname(path);
  const base = basename(path);
  const nowDate = Temporal.Now.plainDateISO().toString();
  const backupPath = join(dir, "backup", `${nowDate}-${base}`);
  await ensureFile(backupPath);
  await copy(path, backupPath, { preserveTimestamps: true, overwrite: true });
}

export async function writeFile(
  path: string,
  contents: string | Uint8Array,
  backup = false,
) {
  await ensureFile(path);
  if (backup) {
    await copyForBackup(path);
  }
  if (typeof contents === "string") {
    await Deno.writeTextFile(path, contents);
  } else {
    await Deno.writeFile(path, contents);
  }
}
