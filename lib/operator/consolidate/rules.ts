import { TextLineStream } from "@std/streams";
import type { Transaction } from "../transaction.ts";
import { logger } from "../../logger.ts";

const RULE_SPLITTER = "->";

async function* loadAndParseRules(
  rulesPath: string,
): AsyncGenerator<[RegExp, string]> {
  const file = await Deno.open(rulesPath);
  const lines = file.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  for await (const line of lines) {
    const [pattern, category] = line.split(RULE_SPLITTER)
      .map((fragment) => fragment.trim());

    if (!category) continue;

    try {
      const expr = new RegExp(pattern, "i");
      yield [expr, category];
    } catch (e) {
      logger.error("Invalid rule", pattern, e);
    }
  }
}

export async function getRuleMapperFromPath(rulesPath: string): Promise<
  (t: Transaction) => string
> {
  try {
    const validRules: [RegExp, string][] = await Array.fromAsync(
      loadAndParseRules(rulesPath),
    );

    return function mapToCategory(t: Transaction): string {
      for (const [pattern, category] of validRules) {
        if (pattern.test(t.description)) return category;
      }

      return "";
    };
  } catch (e) {
    logger.error("Failed to generate rule mapper", { rulesPath }, e);
  }

  return () => "";
}
