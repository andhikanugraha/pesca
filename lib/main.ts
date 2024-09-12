import { stringify as stringifyCsv } from "@std/csv";
import { ensureFile } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import task from "tasuku";

import type {
  DriverDefinition,
  DriverOutput,
  SourceParams,
  Task,
  Transaction,
} from "./lib.ts";

import { resolveConfig, type Config } from "./config.ts";
import { withBrowserContext, type WithPage } from "./browser.ts";

import citi from "./drivers/citi.ts";
import dbs from "./drivers/dbs.ts";
import { resolve } from "@std/path";

function selectDriver(
  source: SourceParams,
): DriverDefinition | undefined {
  const drivers = [citi, dbs];
  for (const driver of drivers) {
    if (driver.supportsSource(source)) {
      return driver;
    }
  }
}

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
}: {
  source: SourceParams;
  setError: (e?: Error | string) => void;
  withPage: WithPage;
  task: Task;
  artifactBasePath: string;
  outputs: DriverOutput[];
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
    await withPage(async (page) => {
      try {
        const output = await driver.pull({
          source,
          task,
          page,
          storeArtifact,
        });

        outputs.push(output);
      } catch (e) {
        setError(e);
      }
    });
  } catch {
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

  transactions.sort((a, b) => {
    // Sort in descending order
    return Temporal.PlainDate.compare(a.date, b.date);
  });

  const path = `${artifactBasePath}/transactions.csv`;
  await ensureFile(path);
  await Deno.writeTextFile(
    path,
    stringifyCsv(
      transactions.map((t) => [
        t.date.toString(),
        t.description,
        t.amount,
        t.account,
        t.isPending ? "pending" : "cleared",
      ]),
    ),
  );
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

async function executePull(config: Config, artifactBasePath: string) {
  const { profilePath } = config;
  await withBrowserContext({ profilePath }, async (withPage) => {
    const outputs = await processSources({
      config,
      task,
      artifactBasePath,
      withPage,
    });
    await writeCombinedOutput({ artifactBasePath, outputs });
    await writeSyncPlaceholder({ artifactBasePath, outputs });
  });
}

export default async function main(pathToConfigToml: string) {
  pathToConfigToml = resolve(Deno.cwd(), pathToConfigToml);
  let unresolvedConfig: Record<string, unknown> = {};

  await task(`Reading ${pathToConfigToml}`, async () => {
    const tomlString = await Deno.readTextFile(pathToConfigToml);
    unresolvedConfig = parseToml(tomlString);
  });

  const configTask = await task(
    "Resolving configuration",
    async ({ task }): Promise<[Config, string]> => {
      const config = await resolveConfig({ config: unresolvedConfig, task });
      const outputBasePath = getOutputBasePath({ config });
      return [config, outputBasePath];
    },
  );

  const [config, outputBasePath] = configTask.result;
  await executePull(config, outputBasePath);
}
