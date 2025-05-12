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

export interface StoredArtifact {
  name: string;
  readable: ReadableStream<Uint8Array>;
}

export interface DriverDefinition {
  name: string;
  supportsSource: (p: UnresolvedSourceParams) => boolean;

  // Gen 2
  fetchArtifacts: (
    p: ScraperParams,
  ) => AsyncGenerator<[name: string, contents: string | Uint8Array | ReadableStream<Uint8Array>]>;
  parseArtifacts: (
    p: { source: SourceParams; logger: Logger },
    artifacts: AsyncIterable<StoredArtifact>,
  ) => AsyncGenerator<Transaction>;
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

export function parseDdMmmYyyy(date: string): Temporal.PlainDate {
  const parts = date.split(" ");
  if (parts.length !== 3) {
    throw new Error('Invalid short date format. Expected "DD Mon YYYY".');
  }

  const day = parseInt(parts[0], 10);
  const monthAbbreviation = parts[1];
  const year = parseInt(parts[2], 10);

  const monthMap: Record<string, number> = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
  };

  const month = monthMap[monthAbbreviation];

  if (!month) {
    throw new Error(`Invalid month abbreviation: ${monthAbbreviation}`);
  }

  return new Temporal.PlainDate(year, month, day);
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
  contents: string | Uint8Array | ReadableStream<Uint8Array>,
  backup = false,
) {
  await ensureFile(path);
  if (backup) {
    await copyForBackup(path);
  }

  if (typeof contents === "string") {
    return Deno.writeTextFile(path, contents);
  }

  // Uint8Array or ReadableStream
  return Deno.writeFile(path, contents);
}
