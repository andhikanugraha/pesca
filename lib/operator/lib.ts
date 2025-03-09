import type { Task } from "tasuku";
import type { Page } from "playwright";
import type { UnresolvedSourceParams } from "./config.ts";
import { Transaction } from "./transaction.ts";

export type { Task };
export { Transaction };

export type { SourceParams } from "./config.ts";

export interface ScraperParams {
  source: UnresolvedSourceParams;
  task: Task;
  page: Page;
  storeArtifact: (name: string, contents: string | Uint8Array) => Promise<void>;
}

export type Scraper = (p: ScraperParams) => Promise<Transaction[]>;

export interface DriverDefinition {
  name: string;
  pull: (p: ScraperParams) => Promise<DriverOutput>;
  supportsSource: (p: UnresolvedSourceParams) => boolean;
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
