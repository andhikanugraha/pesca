import { resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Config as NgrokConfig } from "@ngrok/ngrok"

import type { Task } from "tasuku";

export interface SourceParams {
  key: string;
  from1Password?: string;
  username?: string;
  password?: string;
  website?: string;
  device?: string;
  server?: string;
  port?: number;
  from?: string;
  folder?: string;
  [key: string]: unknown;
}

export interface UnresolvedSourceParams extends Partial<SourceParams> {
  key?: string;
}

export interface SchedulerParams {
  schedule?: string;
  retryInterval?: string;
}

export interface PushoverConfigParams {
  token: string;
  user: string;
  device?: string;
}

export interface NgrokConfigParams extends NgrokConfig {}

export interface Config {
  profilePath: string;
  outputPath: string;
  consolidatedPath: string;
  sources: SourceParams[];
  scheduler: SchedulerParams;
  rulesPath: string;
  xlsx: string;
  pushover?: PushoverConfigParams;
  ngrok?: NgrokConfigParams;
}

interface OpLoginItem {
  website: string;
  username: string;
  password: string;
}

interface OpEmailAccountItem {
  type: string;
  server: string;
  port: number;
  username: string;
  password: string;
}

async function fetch1PasswordItem(
  title: string,
): Promise<OpLoginItem | OpEmailAccountItem | undefined> {
  const command = new Deno.Command("op", {
    args: ["item", "get", "--reveal", "--format", "json", title],
  });
  const { stdout } = await command.output();
  const stdoutText = new TextDecoder().decode(stdout);
  const item = JSON.parse(stdoutText);

  function field(id: string): string {
    return item.fields.find(
      (f: { id: string; value: string }) => f.id === id,
    ).value;
  }

  const { category } = item;
  if (category === "LOGIN") {
    return {
      website: item.urls.find((f: { primary: boolean; href: string }) =>
        f.primary
      ).href,
      username: field("username"),
      password: field("password"),
    };
  } else if (category === "EMAIL_ACCOUNT") {
    return {
      type: field("pop_type"),
      username: field("pop_username"),
      password: field("pop_password"),
      server: field("pop_server"),
      port: parseInt(field("pop_port")),
    };
  }
}

async function init1Password() {
  const command = new Deno.Command("op", { args: ["signin"] });
  await command.output();
}

async function assignFrom1Password(
  target: Record<string, unknown>,
  opBasePath: string,
): Promise<Record<string, unknown>> {
  const item = await fetch1PasswordItem(opBasePath);
  Object.assign(target, item);

  if (!target.key) {
    target.key = opBasePath;
  }

  return target;
}

async function resolveSources(
  { task, config, resolvedConfig }: {
    task: Task;
    config: Record<string, unknown>;
    resolvedConfig: Config;
  },
) {
  const sources = config.sources as UnresolvedSourceParams[];

  await init1Password();

  await task.group((task) =>
    sources.map((source) =>
      task(
        `Resolving credentials: ${source.key || source.from1Password}`,
        async ({ setTitle, setError }) => {
          if (source.key) {
            setTitle(`Source credentials defined: ${source.key}`);
            resolvedConfig.sources.push({
              key: source.key,
              ...source,
            });
          } else if (source.from1Password) {
            setTitle(
              `Getting credentials from 1Password: ${source.from1Password}`,
            );
            const resolvedSource = await assignFrom1Password(
              source,
              source.from1Password,
            ) as SourceParams;
            if (resolvedSource) {
              resolvedConfig.sources.push(resolvedSource);
              setTitle(
                `Resolved credentials from 1Password: ${source.from1Password}`,
              );
            } else {
              setError("Failed to fetch credentials from 1Password");
            }
          }
        },
      )
    ), { concurrency: 10 });
}

function applyDefaults(unresolvedConfig: Record<string, unknown>): Config {
  function path(prop: string, path: string) {
    if (unresolvedConfig[prop]) {
      return resolve(unresolvedConfig[prop] as string);
    }
    return resolve(import.meta.dirname || "", "..", path);
  }

  return {
    ...unresolvedConfig,
    profilePath: path("profilePath", "state/profile"),
    outputPath: path("outputPath", "output"),
    consolidatedPath: path("consolidatedPath", "consolidated"),
    xlsx: path("xlsx", "consolidated/consolidated.xlsx"),
    sources: [] as SourceParams[],
    scheduler: unresolvedConfig.scheduler || {},
    rulesPath: unresolvedConfig.rulesPath as string || "pesca.rules",
  };
}

export async function resolveConfig({
  config: unresolvedConfig,
  task,
}: {
  config: Record<string, unknown>;
  task: Task;
}): Promise<Config> {
  const resolvedConfig = applyDefaults(unresolvedConfig);

  await task.group((task) => [
    task(
      "Profile path: " + resolvedConfig.profilePath,
      () => ensureDir(resolvedConfig.profilePath),
    ),
    task(
      "Output path: " + resolvedConfig.outputPath,
      () => ensureDir(resolvedConfig.outputPath),
    ),
    task(
      "Consolidated path: " + resolvedConfig.consolidatedPath,
      () => ensureDir(resolvedConfig.consolidatedPath),
    ),
    task(
      "Resolving source credentials",
      ({ task }) =>
        resolveSources({ task, config: unresolvedConfig, resolvedConfig }),
    ),
  ], { concurrency: 3 });

  return resolvedConfig;
}
