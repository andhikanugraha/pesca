// html tag function to trim and remove preceding whitespace
export function html(strings: TemplateStringsArray, ...values: unknown[]) {
  const result = String.raw(strings, ...values);
  // Remove leading/trailing whitespace and preceding whitespace on each line
  return result
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n")
    .trim();
}
