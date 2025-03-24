import { resolve } from "@std/path";
import { parse } from "@std/yaml";
import open from "open";
import { createOperator } from "./lib/operator/operator.ts";
import startServer from "./lib/server/server.tsx";
import task from "tasuku";
import { createScheduler } from "./lib/scheduler/scheduler.ts";
import { type Config, resolveConfig } from "./lib/config.ts";

async function main(pathToConfigYaml = "pesca.yml") {
  pathToConfigYaml = resolve(Deno.cwd(), pathToConfigYaml);
  let unresolvedConfig: Record<string, unknown> = {};

  await task(`Reading ${pathToConfigYaml}`, async () => {
    const tomlString = await Deno.readTextFile(pathToConfigYaml);
    unresolvedConfig = parse(tomlString) as Record<string, unknown>;
  });

  const config = (await task(
    "Resolving configuration",
    ({ task }): Promise<Config> =>
      resolveConfig({ config: unresolvedConfig, task }),
  )).result;

  const operator = createOperator(config);
  const scheduler = createScheduler(
    ({ signal }) => operator.run({ signal }),
    config,
  );

  if (operator) {
    const server = await startServer({ config, scheduler, operator });
    if (server) {
      await open(
        `http://${config.ngrok?.domain || `localhost:${server.addr.port}`}/`,
      );
    }
  }
}

main(...Deno.args);
