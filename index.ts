import { resolve } from "@std/path";
import { parse } from "@std/yaml";
import open from "open";
import { createOperator } from "./lib/operator/operator.ts";
import startServer from "./lib/server/server.tsx";
import { createScheduler } from "./lib/scheduler/scheduler.ts";
import { resolveConfig } from "./lib/config.ts";
import { logger } from "./lib/logger.ts";

async function main(pathToConfigYaml = "pesca.yml") {
  pathToConfigYaml = resolve(Deno.cwd(), pathToConfigYaml);

  logger.info(`Reading ${pathToConfigYaml}`);
  const yamlString = await Deno.readTextFile(pathToConfigYaml);
  const unresolvedConfig = parse(yamlString) as Record<string, unknown>;

  logger.info("Resolving configuration");
  const config = await resolveConfig(unresolvedConfig);

  const operator = createOperator(config);
  const scheduler = createScheduler(
    ({ signal }) => operator.run({ signal }),
    config,
  );

  if (!operator) {
    logger.error("Failed to init operator");
    return;
  }

  const server = await startServer({ config, scheduler, operator });
  if (!server) {
    logger.error("Failed to start server.");
    return;
  }

  await open(
    `http://${config.ngrok?.domain ?? `localhost:${server.addr.port}`}/`,
  );
}

if (import.meta.main) {
  main(...Deno.args);
}
