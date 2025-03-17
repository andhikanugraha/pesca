import type { Task } from "tasuku";
import type { FrameLocator, Page } from "playwright";
import type { SourceParams, UnresolvedSourceParams } from "../config.ts";
import { Transaction, type TransactionMeta } from "./transaction.ts";
import type { NotifyFn } from "./pushover.ts";

export {
  type FrameLocator,
  type NotifyFn,
  type Page,
  type SourceParams,
  type Task,
  Transaction,
  type TransactionMeta,
};

export interface ScraperParams {
  source: SourceParams;
  task: Task;
  page: Page;
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
