import { ensureFile } from "@std/fs";

import { Transaction, writeFile, type DriverOutput, type SourceParams } from "./lib.ts";
import { logger } from "../logger.ts";

import type { Config } from "../config.ts";
import { withBrowserContext, type WithPage } from "./browser.ts";

import { selectDriver } from "./driver.ts";
import { generateNotifyFn, type NotifyFn } from "./pushover.ts";
import { join } from "@std/path";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function getOutputBasePath({ config }: { config: Config }): string {
  const now = Temporal.Now.zonedDateTimeISO();
  const month = pad(now.month);
  const day = pad(now.day);
  const hour = pad(now.hour);
  const minute = pad(now.minute);
  const second = pad(now.second);
  const timedir = `${now.year}-${month}-${day}T${hour}.${minute}.${second}`;

  const artifactBasePath = join(config.outputPath, timedir);

  return artifactBasePath;
}

async function processSource({ source, withPage, artifactBasePath, notify }: {
  source: SourceParams;
  withPage: WithPage;
  artifactBasePath: string;
  notify: NotifyFn;
}): Promise<DriverOutput | null> {
  const { key } = source;

  const driver = selectDriver(source);
  if (!driver) {
    logger.error(`No matching driver for source: ${key}`);
    return null;
  }

  const childLogger = logger.child({ sourceKey: key });

  async function storeArtifact(name: string, contents: string | Uint8Array) {
    childLogger.info(`Storing artifact ${name}`);
    await writeFile(join(artifactBasePath, key, name), contents);
  }

  const sourceNotify: NotifyFn = (
    { message, title = key, device = source.device },
  ) => notify({ message, title, device });

  const driverParams = {
    source,
    logger: childLogger,
    storeArtifact,
    notify: sourceNotify,
  };

  try {
    let output: DriverOutput | null = null;
    let transactionCount = 0;
    await sourceNotify({ message: "Starting scraping...", priority: -1 });
    await withPage(async (page) => {
      output = await driver.pull({ ...driverParams, page });
      transactionCount = output.transactions.length;
    });

    if (transactionCount > 0) {
      await sourceNotify({
        message: `Extracted ${transactionCount} transactions.`,
        priority: -1,
      });
    }

    return output;
  } catch {
    await sourceNotify({ message: "Scraping failed." });
    logger.error(`Failed processing source: ${key}`);
  }

  return null;
}

async function* processSources({
  config,
  artifactBasePath,
  withPage,
}: {
  config: Config;
  artifactBasePath: string;
  withPage: WithPage;
}): AsyncGenerator<DriverOutput, void, undefined> {
  const notify = generateNotifyFn(config);

  for (const source of config.sources) {
    logger.info(`Processing source: ${source.key}`);
    const output = await processSource({
      source,
      withPage,
      artifactBasePath,
      notify,
    });
    if (output) {
      yield output;
    }
  }
}

async function writeOutputJson(
  { artifactBasePath, outputs }: {
    artifactBasePath: string;
    outputs: DriverOutput[];
  },
) {
  const transactions = outputs.flatMap((t) => t.transactions);

  if (transactions.length === 0) return;

  transactions.sort(Transaction.sort);

  const contentObject = { transactions };
  const contentString = JSON.stringify(contentObject, null, 2);

  const outputJsonPath = join(artifactBasePath, "output.json");

  await ensureFile(outputJsonPath);
  await Deno.writeTextFile(outputJsonPath, contentString);
}

export async function executePull(config: Config) {
  const { profilePath } = config;
  const artifactBasePath = getOutputBasePath({ config });
  await withBrowserContext({ profilePath }, async (withPage) => {
    const outputs = await Array.fromAsync(
      processSources({ config, artifactBasePath, withPage }),
    );

    logger.info("Generating combined artifact");
    await writeOutputJson({ artifactBasePath, outputs });
  });
}
