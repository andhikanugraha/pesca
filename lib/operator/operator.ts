import task from "tasuku";
import { JsonParseStream } from "@std/json";

import { type Config, resolveConfig } from "../config.ts";
import { executePull } from "./pull.ts";

export type Operator = {
  pull: ({ signal }: { signal: AbortSignal }) => Promise<boolean>;
};

type Payload = {
  config: Config;
  command: "pull";
};

const TIMEOUT = 5 * 60 * 1000;

const childFlags = [
  "--allow-read",
  "--allow-write",
  "--allow-sys",
  "--allow-env",
  "--allow-run",
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

  signal.onabort = () => child.kill();

  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(JSON.stringify(payload)));
  return child;
}

export async function createOperator(
  unresolvedConfig: Record<string, unknown>,
): Promise<Operator> {
  const configTask = await task(
    "Resolving configuration",
    ({ task }): Promise<Config> =>
      resolveConfig({ config: unresolvedConfig, task }),
  );

  const config = configTask.result;

  return {
    async pull({ signal }): Promise<boolean> {
      try {
        const child = await spawnSelf({ config, command: "pull" }, signal);
        await child.output();
        const status = await child.status;
        return status.success;
      } catch (_e) {
        // do nothing
        return false;
      }
    },
  };
}

async function main() {
  const stdin = Deno.stdin.readable.pipeThrough(new TextDecoderStream());
  const stdinJson = stdin.pipeThrough(new JsonParseStream()).getReader();

  const payload = await stdinJson.read();
  const { config, command } = payload.value as object as Payload;

  if (command === "pull") {
    try {
      setTimeout(() => Deno.exit(1), TIMEOUT);
      await executePull(config);
    } catch (_e) {
      Deno.exit(1);
    }
  }
}

if (import.meta.main) {
  await main();
}
