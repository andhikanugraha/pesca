import { resolve } from "@std/path";
import { parse } from "@std/toml";
import { createOperator } from "./lib/operator/operator.ts";
import createServer from "./lib/server/server.tsx";
import task from "tasuku";
import { createScheduler } from "./lib/scheduler.ts";
import { type Config, resolveConfig } from "./lib/config.ts";

async function main(pathToConfigToml = "pesca.toml") {
  pathToConfigToml = resolve(Deno.cwd(), pathToConfigToml);
  let unresolvedConfig: Record<string, unknown> = {};

  await task(`Reading ${pathToConfigToml}`, async () => {
    const tomlString = await Deno.readTextFile(pathToConfigToml);
    unresolvedConfig = parse(tomlString);
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
    // deno-lint-ignore require-await
    task("Initiating server", async ({ setTitle }) => {
      const server = createServer({ scheduler, operator });
      const s = Deno.serve(server.fetch);
      setTitle(`Listening to ${s.addr.hostname}:${s.addr.port}`);
    });
  }
}

main(...Deno.args);
