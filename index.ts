import { resolve } from "@std/path";
import { parse } from "@std/toml";
import { createOperator } from "./lib/operator/operator.ts";
import createServer from "./lib/server/server.tsx";
import task from "tasuku";
import { createScheduler } from "./lib/scheduler.ts";

async function main(pathToConfigToml = "pesca.toml") {
  pathToConfigToml = resolve(Deno.cwd(), pathToConfigToml);
  let unresolvedConfig: Record<string, unknown> = {};

  await task(`Reading ${pathToConfigToml}`, async () => {
    const tomlString = await Deno.readTextFile(pathToConfigToml);
    unresolvedConfig = parse(tomlString);
  });

  const operator = (await task("Instantiating Operator", () => {
    return createOperator(unresolvedConfig);
  })).result;

  const scheduler = createScheduler(({ signal }) => operator.pull({ signal }));

  if (operator) {
    // deno-lint-ignore require-await
    task("Creating server", async ({ setTitle }) => {
      const server = createServer({ scheduler });
      scheduler.start();
      const s = Deno.serve(server.fetch);
      setTitle(`Listening to ${s.addr.hostname}:${s.addr.port}`);
    });
  }
}

main(...Deno.args);
