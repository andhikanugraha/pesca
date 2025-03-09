import { resolve } from "@std/path";
import { parse } from "@std/toml";
import { createOperator } from "./lib/operator.ts";
import task from "tasuku";

main("pesca.toml");

async function main(pathToConfigToml = "pesca.toml") {
  pathToConfigToml = resolve(Deno.cwd(), pathToConfigToml);
  let unresolvedConfig: Record<string, unknown> = {};

  await task(`Reading ${pathToConfigToml}`, async () => {
    const tomlString = await Deno.readTextFile(pathToConfigToml);
    unresolvedConfig = parse(tomlString);
  });

  const operator = await createOperator(unresolvedConfig);

  while (confirm('\nPull?')) {
    await operator.pull();
  }
}
