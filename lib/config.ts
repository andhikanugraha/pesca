import { resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Config as NgrokConfig } from "@ngrok/ngrok";
import { logger } from "./logger.ts";

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

export interface ScheduleParams {
  daily?: string;
  retry?: string;
  interval?: string;
  tz?: string;
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
  schedule: ScheduleParams;
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
    let website = "";
    if (item.urls.length === 1) {
      website = item.urls[0].href;
    } else {
      website = item.urls.find(
        (f: { primary: boolean; href: string }) => f.primary,
      ).href;
    }
    return {
      website,
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

async function resolveSourceFrom1Password(
  source: UnresolvedSourceParams,
): Promise<SourceParams | null> {
  if (!source.from1Password) return null;

  const title = source.from1Password;
  logger.info(`Fetching credentials from 1Password: ${title}`);
  const item = await fetch1PasswordItem(title);
  if (!item) {
    logger.error(`Failed to resolve credentials from 1Password: ${title}`);
    return null;
  }

  logger.info(`Resolved credentials from 1Password: ${title}`);
  return {
    key: title,
    ...source,
    ...item,
  };
}

async function* resolveSources(
  unresolvedSources: UnresolvedSourceParams[],
): AsyncGenerator<SourceParams, void, void> {
  await init1Password();

  for (const source of unresolvedSources) {
    logger.info(`Resolving credentials: ${source.key || source.from1Password}`);
    const { key, from1Password } = source;

    if (from1Password) {
      const resolvedSource = await resolveSourceFrom1Password(source);

      if (resolvedSource) {
        yield resolvedSource;
      }
    } else if (key) {
      logger.info(`Source credentials defined: ${key}`);
      yield source as SourceParams;
    }
  }
}

function applyDefaults(unresolvedConfig: Record<string, unknown>): Config {
  function path(prop: string, defaultPath: string) {
    if (unresolvedConfig[prop]) {
      return resolve(unresolvedConfig[prop] as string);
    }
    return resolve(import.meta.dirname || "", "..", defaultPath);
  }

  return {
    ...unresolvedConfig,
    profilePath: path("profilePath", "state/profile"),
    outputPath: path("outputPath", "output"),
    consolidatedPath: path("consolidatedPath", "consolidated"),
    xlsx: path("xlsx", "consolidated/consolidated.xlsx"),
    sources: [] as SourceParams[],
    schedule: unresolvedConfig.schedule || {},
    rulesPath: unresolvedConfig.rulesPath as string || "pesca.rules",
  };
}

export async function resolveConfig(
  unresolvedConfig: Record<string, unknown>,
): Promise<Config> {
  const resolvedConfig = applyDefaults(unresolvedConfig);

  logger.info("Profile path: " + resolvedConfig.profilePath);
  await ensureDir(resolvedConfig.profilePath);

  logger.info("Output path: " + resolvedConfig.outputPath);
  await ensureDir(resolvedConfig.outputPath);

  logger.info("Consolidated path: " + resolvedConfig.consolidatedPath);
  await ensureDir(resolvedConfig.consolidatedPath);

  logger.info("Resolving source credentials");
  resolvedConfig.sources = await Array.fromAsync(
    resolveSources(unresolvedConfig.sources as UnresolvedSourceParams[] ?? []),
  );

  return resolvedConfig;
}
