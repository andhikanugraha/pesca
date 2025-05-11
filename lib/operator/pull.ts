import {
  type SourceParams,
  writeFile,
} from "./lib.ts";
import { logger } from "../logger.ts";

import type { Config } from "../config.ts";
import { createBrowserContext, type DisposablePage } from "./browser.ts";

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

async function processSource({ source, createPage, artifactBasePath, notify }: {
  source: SourceParams;
  createPage: () => Promise<DisposablePage>;
  artifactBasePath: string;
  notify: NotifyFn;
}): Promise<void> {
  const { key } = source;

  const driver = selectDriver(source);
  if (!driver) {
    logger.error(`No matching driver for source: ${key}`);
    return;
  }

  const childLogger = logger.child({ sourceKey: key });

  async function storeArtifact(name: string, contents: string | Uint8Array | ReadableStream<Uint8Array>) {
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
    createPage,
  };

  try {
    logger.info(`Starting scraping for source: ${key}`);
    await sourceNotify({ message: "Starting scraping...", priority: -1 });
    const artifacts = driver.fetchArtifacts(driverParams);
    for await (const [name, contents] of artifacts) {
      await storeArtifact(name, contents);
    }

    logger.info(`Scraping completed for source: ${key}`);
    await sourceNotify({ message: "Scraping completed." });
  } catch {
    await sourceNotify({ message: "Scraping failed." });
    logger.error(`Failed processing source: ${key}`);
  }
}

export async function executePull(config: Config) {
  const { profilePath } = config;
  const artifactBasePath = getOutputBasePath({ config });

  await using context = createBrowserContext({ profilePath });
  const { createPage } = context;

  const notify = generateNotifyFn(config);

  for (const source of config.sources) {
    await processSource({
      source,
      createPage,
      artifactBasePath,
      notify,
    });
  }

  logger.info("All sources processed.");
}
