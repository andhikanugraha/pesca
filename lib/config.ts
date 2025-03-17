import { resolve } from "@std/path";
import { ensureDir } from "@std/fs";

import type { Task } from "tasuku";

export interface SourceParams {
  key: string;
  from1Password?: string;
  username?: string;
  password?: string;
  website?: string;
  device?: string;
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

export interface Config {
  profilePath: string;
  outputPath: string;
  consolidatedPath: string;
  sources: SourceParams[];
  scheduler: SchedulerParams;
  rulesPath: string;
  pushover?: PushoverConfigParams;
}

async function init1Password() {
  const command = new Deno.Command("op", { args: ["signin"] });
  await command.output();
}

async function fetch1PasswordCredential(
  opSecretReferenceBase: string,
  field: string,
) {
  const path = `op://${opSecretReferenceBase}/${field}`;
  const command = new Deno.Command("op", { args: ["read", path] });
  const { stdout } = await command.output();
  const trimmedStdout = new TextDecoder().decode(stdout).trim();

  if (trimmedStdout !== "") {
    return trimmedStdout;
  } else {
    return undefined;
  }
}

async function assignFrom1Password(
  target: Record<string, unknown>,
  opBasePath: string,
  fields: Iterable<string> = ["username", "password", "website"],
): Promise<Record<string, unknown>> {
  const promises: Promise<void>[] = [];
  for (const field of fields) {
    const promise = (async () => {
      const credential = await fetch1PasswordCredential(opBasePath, field);
      if (credential) {
        target[field] = credential;
      }
    })();
    promises.push(promise);
  }

  await Promise.all(promises);

  if (!target.key) {
    const basename = opBasePath.substring(opBasePath.indexOf("/") + 1);
    target.key = basename.replace(/[/\\|:<>?*"]/g, "_");
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
