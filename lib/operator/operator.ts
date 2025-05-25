import { type Config } from "../config.ts";
import { logger } from "../logger.ts";

type Command = "pull" | "consolidate";

export interface Operator {
  run(
    { commands, signal }: { commands?: Command[]; signal: AbortSignal },
  ): Promise<boolean>;
  pull({ signal }: { signal: AbortSignal }): Promise<boolean>;
  consolidate({ signal }: { signal: AbortSignal }): Promise<boolean>;
  pullSource(
    { source, signal }: { source: string; signal: AbortSignal },
  ): Promise<boolean>;
}

type Payload = {
  config: Config;
  commands: Command[];
};

// Use Deno Worker for operator logic
function spawnWorker(payload: Payload, signal: AbortSignal) {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  const { promise: result, resolve, reject } = Promise.withResolvers<boolean>();

  signal.onabort = () => {
    worker.terminate();
    resolve(false);
  };

  worker.onmessage = (e: MessageEvent) => {
    if (e.data && typeof e.data.success === "boolean") {
      resolve(e.data.success);
      worker.terminate();
    }
  };
  worker.onerror = (e) => {
    reject(e);
    worker.terminate();
  };

  worker.postMessage(payload);
  return result;
}

export function createOperator(config: Config): Operator {
  async function run(
    { commands = ["pull", "consolidate"], signal }: {
      commands?: Command[];
      signal: AbortSignal;
    },
  ): Promise<boolean> {
    try {
      logger.info("Spawning operator worker");
      const success = await spawnWorker({ config, commands }, signal);
      logger.debug({ success });
      return success;
    } catch (error) {
      logger.error(error);
      return false;
    }
  }

  async function pullSource(
    { source, signal }: { source: string; signal: AbortSignal },
  ): Promise<boolean> {
    // Clone config and filter sources
    const filteredConfig = {
      ...config,
      sources: config.sources.filter((s) => s.key === source),
    };
    try {
      logger.info(`Spawning operator worker for source: ${source}`);
      const success = await spawnWorker({
        config: filteredConfig,
        commands: ["pull"],
      }, signal);
      logger.debug({ success });
      return success;
    } catch (error) {
      logger.error(error);
      return false;
    }
  }

  return {
    run,
    pull: ({ signal }) => run({ commands: ["pull"], signal }),
    consolidate: ({ signal }) => run({ commands: ["consolidate"], signal }),
    pullSource,
  };
}

// Remove worker entrypoint from this file
