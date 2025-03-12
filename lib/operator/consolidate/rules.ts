import type { Transaction } from "../transaction.ts";

const RULE_SPLITTER = "->";

export default function getRuleMapper(rules: string) {
  const lines = rules.split("\n");
  if (!lines) {
    return () => "";
  }

  const validRules: [RegExp, string][] = [];
  for (const line of lines) {
    let [pattern, category] = line.split(RULE_SPLITTER);
    if (!category) {
      continue;
    }

    try {
      const expr = new RegExp(pattern.trim(), "i");
      category = category.trim();
      validRules.push([expr, category]);
    } catch (_e) {
      // do nothing
    }
  }

  // return closure based on validRules
  return function mapToCategory(t: Transaction): string {
    for (const rule of validRules) {
      const [pattern, category] = rule;
      if (pattern.test(t.description)) {
        return category;
      }
    }

    return "";
  };
}
