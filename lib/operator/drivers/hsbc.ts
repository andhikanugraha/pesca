import { defineDriver, parseFloatSafely, Transaction } from "../lib.ts";
import { CsvParseStream } from "@std/csv";

function parseDateDDMMYYYY(date: string): Temporal.PlainDate {
  return new Temporal.PlainDate(
    parseInt(date.slice(6, 10)),
    parseInt(date.slice(3, 5)),
    parseInt(date.slice(0, 2)),
  );
}

async function* parseTransactionHistoryCsv(
  readable: ReadableStream<Uint8Array>,
): AsyncGenerator<Transaction> {
  const csv = (readable as ReadableStream<BufferSource>)
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new CsvParseStream());

  for await (const row of csv) {
    const [rawDate, remarks, amountString] = row;
    const isDebit = amountString[0] === "-";

    let absoluteAmount = parseFloatSafely(amountString);
    if (isDebit) absoluteAmount = -absoluteAmount;

    yield new Transaction({
      account: "HSBC",
      date: parseDateDDMMYYYY(rawDate),
      absoluteAmount,
      raw: row,
      ...parseRemarks(remarks),
    });
  }
}

function parseRemarks(remarks: string): Partial<Transaction> {
  remarks = remarks?.trim();

  const fees = [
    "BILLED FINANCE CHARGES",
    "CITI PAYALL SERVICE FEE",
    "BILLED  DEFERRED FINANCE CHARGES",
    "LATE FEE CREDIT ADJUSTMENT",
    "LATE CHARGE ASSESSMENT",
  ];
  for (const fee of fees) {
    if (remarks.startsWith(fee)) {
      return {
        displayText: fee,
      };
    }
  }

  let reference: string | undefined = undefined;
  let payeeName = remarks.slice(0, 22).trimEnd();
  const payeeCity = remarks.slice(23, 37).trimEnd();
  const payeeCountryCode = remarks.slice(37, 39);

  if (payeeName.match(/^SINGAPORE[0-9]+$/)) {
    reference = payeeName.substring(9);
    payeeName = "SINGAPORE AIRLINES";
  }

  const _transactionDate = remarks.slice(40, 50);
  const originalCurrencyAmount = parseFloatSafely(remarks.slice(72, -4), true);
  const originalCurrencyCode = remarks.slice(-3);

  return {
    payeeName,
    payeeCity,
    payeeCountryCode,
    reference,
    originalCurrencyCode,
    originalCurrencyAmount,
  };
}

export default defineDriver({
  name: "hsbc.com.sg",

  supportsSource: (source) => !!source.website?.includes("hsbc.com.sg"),

  // deno-lint-ignore require-yield
  async *fetchArtifacts({ logger }) {
    logger.info("Artifact fetching not implemented");
  },

  async *parseArtifacts({ logger }, artifacts) {
    for await (const { name, readable } of artifacts) {
      if (!name.endsWith(".csv")) continue;
      logger.info(`Parsing artifact: ${name}`);
      yield* parseTransactionHistoryCsv(readable);
    }
  },
});
