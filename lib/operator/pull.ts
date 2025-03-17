import { ensureFile } from "@std/fs";
import task from "tasuku";

import { DriverOutput, SourceParams, Task, Transaction } from "./lib.ts";

import type { Config } from "../config.ts";
import { withBrowserContext, type WithPage } from "./browser.ts";

import { selectDriver } from "./driver.ts";
import { generateNotifyFn, type NotifyFn } from "./pushover.ts";

function getOutputBasePath({ config }: { config: Config }): string {
  const now = Temporal.Now.plainDateTimeISO();
  const month = now.month.toString().padStart(2, "0");
  const day = now.day.toString().padStart(2, "0");
  const hour = now.hour.toString().padStart(2, "0");
  const minute = now.minute.toString().padStart(2, "0");
  const second = now.second.toString().padStart(2, "0");
  const timedir = `${now.year}-${month}-${day}T${hour}.${minute}.${second}`;

  const artifactBasePath = `${config.outputPath}/${timedir}`;

  return artifactBasePath;
}

async function processSource({
  source,
  setError,
  withPage,
  task,
  artifactBasePath,
  outputs,
  notify,
}: {
  source: SourceParams;
  setError: (e?: Error | string) => void;
  withPage: WithPage;
  task: Task;
  artifactBasePath: string;
  outputs: DriverOutput[];
  notify: NotifyFn;
}): Promise<void> {
  const { key } = source;

  const driver = selectDriver(source);
  if (!driver) {
    setError(`No matching driver for source: ${key}`);
    return;
  }

  async function storeArtifact(name: string, contents: string | Uint8Array) {
    await task(
      `Storing artifact ${name}`,
      async () => {
        const path = `${artifactBasePath}/${key}/${name}`;
        await ensureFile(path);
        if (typeof contents === "string") {
          await Deno.writeTextFile(path, contents);
        } else {
          await Deno.writeFile(path, contents);
        }
      },
    );
  }

  try {
    notify({ title: key, message: "Starting scraping...", priority: -1 });
    await withPage(async (page) => {
      const output = await driver.pull({
        source,
        task,
        page,
        storeArtifact,
        notify: ({ message, title = key, device = source.device }) =>
          notify({ message, title, device }),
      });

      outputs.push(output);
      await notify({
        title: key,
        message:
          `Scraping successful. Extracted ${output.transactions.length} transactions.`,
        priority: -1,
      });
    });
  } catch {
    await notify({ title: key, message: "Scraping failed." });
    setError(`Failed processing source: ${key}`);
  }
}

async function writeCombinedOutput(
  { artifactBasePath, outputs }: {
    artifactBasePath: string;
    outputs: DriverOutput[];
  },
) {
  const transactions: Transaction[] = [];
  for (const output of outputs) {
    transactions.push(...output.transactions);
  }

  if (transactions.length === 0) {
    return;
  }

  transactions.sort((a, b) => (
    // Sort in descending order
    Temporal.PlainDate.compare(a.date, b.date)
  ));

  const path = `${artifactBasePath}/transactions.csv`;
  await ensureFile(path);

  const handle = await Deno.open(path, { write: true });
  Transaction.toCsvStream(transactions)
    .pipeThrough(new TextEncoderStream())
    .pipeTo(handle.writable);
}

async function processSources({
  config,
  task,
  artifactBasePath,
  withPage,
}: {
  config: Config;
  task: Task;
  artifactBasePath: string;
  withPage: WithPage;
}): Promise<DriverOutput[]> {
  const outputs: DriverOutput[] = [];
  const notify = generateNotifyFn(config);
  await task.group((task) =>
    config.sources.map((source) => {
      return task(
        `Processing source: ${source.key}`,
        ({ task, setError }) =>
          processSource({
            source,
            withPage,
            task,
            setError,
            outputs,
            artifactBasePath,
            notify,
          }),
      );
    })
  );

  return outputs;
}

async function writeSyncPlaceholder(
  { artifactBasePath, outputs }: {
    artifactBasePath: string;
    outputs: DriverOutput[];
  },
) {
  const transactions: Transaction[] = [];
  for (const output of outputs) {
    transactions.push(...output.transactions);
  }

  if (transactions.length === 0) {
    return;
  }

  transactions.sort((a, b) => Temporal.PlainDate.compare(a.date, b.date));

  const contentObject = { transactions };
  const contentString = JSON.stringify(contentObject, null, 2);

  const file = `${artifactBasePath}/output.json`;

  await ensureFile(file);
  await Deno.writeTextFile(file, contentString);
}

export async function executePull(config: Config) {
  const { profilePath } = config;
  const artifactBasePath = getOutputBasePath({ config });
  await withBrowserContext({ profilePath }, async (withPage) => {
    const outputs = await processSources({
      config,
      task,
      artifactBasePath,
      withPage,
    });
    task("Generating combined artifacts", async () => {
      await writeCombinedOutput({ artifactBasePath, outputs });
      await writeSyncPlaceholder({ artifactBasePath, outputs });
    });
  });
}
