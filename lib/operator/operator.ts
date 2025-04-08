import { JsonParseStream } from "@std/json";

import { type Config } from "../config.ts";
import { executePull } from "./pull.ts";
import { executeConsolidation } from "./consolidate.ts";
import open from "open";
import { logger } from "../logger.ts";

type Command = "pull" | "consolidate";

export interface Operator {
  run(
    { commands, signal }: { commands?: Command[]; signal: AbortSignal },
  ): Promise<boolean>;
  pull({ signal }: { signal: AbortSignal }): Promise<boolean>;
  consolidate({ signal }: { signal: AbortSignal }): Promise<boolean>;
}

type Payload = {
  config: Config;
  commands: Command[];
};

const TIMEOUT = 5 * 60 * 1000; // 5 minutes

const childFlags = [
  "--allow-read",
  "--allow-write",
  "--allow-sys",
  "--allow-env",
  "--allow-run",
  "--allow-net",
  "--allow-import=cdn.sheetjs.com,jsr.io",
  "--unstable-temporal",
];

async function spawnSelf(payload: Payload, signal: AbortSignal) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      ...childFlags,
      import.meta.filename as string,
    ],
    stdin: "piped",
  });
  const child = command.spawn();

  signal.onabort = () => {
    try {
      child.kill();
      return true;
    } catch (_e) {
      return false;
    }
  };

  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(JSON.stringify(payload)));
  return child;
}

export function createOperator(config: Config): Operator {
  async function run(
    { commands = ["pull", "consolidate"], signal }: {
      commands?: Command[];
      signal: AbortSignal;
    },
  ): Promise<boolean> {
    try {
      const child = await spawnSelf({ config, commands }, signal);
      await child.output();
      const status = await child.status;
      return status.success;
    } catch (_e) {
      return false;
    }
  }

  return {
    run,
    pull: ({ signal }) => run({ commands: ["pull"], signal }),
    consolidate: ({ signal }) => run({ commands: ["consolidate"], signal }),
  };
}

async function main() {
  const stdinJson = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new JsonParseStream())
    .getReader();
  const payload = await stdinJson.read();
  const { config, commands } = payload.value as object as Payload;

  try {
    setTimeout(() => Deno.exit(1), TIMEOUT);
    if (commands.includes("pull")) {
      await executePull(config);
    }
    if (commands.includes("consolidate")) {
      await executeConsolidation(config);
      if (commands.length === 1) {
        open(config.xlsx);
      }
    }
    Deno.exit(0);
  } catch (_e) {
    logger.error(_e);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
