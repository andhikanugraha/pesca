import {
  fetchAllMessages,
  ImapClient,
  ImapMessage,
} from "@workingdevshero/deno-imap";
import PostalMime from "postal-mime";
import { load } from "cheerio";

import {
  defineDriver,
  type Logger,
  parseDdMmmYyyy,
  parseFloatSafely,
  Transaction,
} from "../lib.ts";

const DRIVER_NAME = "grabpay";

function getTransactionRows(htmlContent: string): string[][] {
  // Specify the start and end HTML comments
  const startComment = "<!-- Transactions START HERE -->";
  const endComment = "<!-- Transactions END HERE -->";

  // Extract the portion of HTML content between the specified HTML comments
  const startIndex = htmlContent.indexOf(startComment);
  const endIndex = htmlContent.indexOf(endComment);
  const extractedHtml = htmlContent.substring(
    startIndex + startComment.length,
    endIndex,
  ).trim();

  // Load the extracted HTML content into cheerio
  const $ = load(extractedHtml);

  // Search for a table using cheerio
  const rows = $("tr");
  const outputRows: string[][] = [];

  rows.each((_, tr) => {
    const [td0, td1, td2] = $("td", tr).map((_, td) => $(td));

    const cells: string[] = [
      td0.text().trim(),
      ...$("span", td1).map((_, span) => $(span).text().trim()).get(),
      td2.text().trim(),
    ];
    outputRows.push(cells);
  });

  return outputRows;
}

async function* fetchMessages(
  account: {
    server: string;
    port: number;
    username: string;
    password: string;
  },
  mailboxName: string = "INBOX",
  logger: Logger,
): AsyncGenerator<ImapMessage, void, undefined> {
  logger.info(`Connecting securely to ${account.server}:${account.port}...`);
  const client = new ImapClient({
    host: account.server,
    port: account.port,
    tls: true,
    username: account.username,
    password: account.password,
  });

  await client.connect();
  logger.info("Secure connection successful.");

  logger.info("Fetching messages...");
  const messages = await fetchAllMessages(client, mailboxName, { full: true });

  for (const msg of messages) {
    yield msg;
  }

  await client.disconnect();
  logger.info("Disconnected from IMAP server.");
}

async function parseMessageRaw(raw: Uint8Array | ReadableStream<Uint8Array>) {
  // Parse the EML file using postal-mime
  const parsedEmail = await PostalMime.parse(raw);

  // Get the HTML content of the email message
  const htmlContent = parsedEmail.html || "";

  // Get the date of the statement
  const $a = load(htmlContent);
  const dateText = $a("td[width=240]").text().trim();
  const date = parseDdMmmYyyy(dateText);

  const rows = getTransactionRows(htmlContent);

  return { date, rows };
}

function* loadTransactionsGenerator(
  account: string,
  date: Temporal.PlainDate,
  rows: string[][],
): Generator<Transaction, void, undefined> {
  for (const row of rows) {
    const [_, rawDescription, paymentMethod, amount] = row;
    const amountFloat = parseFloatSafely(amount);
    const isDebitFromGrabPay = amountFloat < 0;
    const absoluteAmount = Math.abs(amountFloat);

    const baseTransaction = {
      account,
      date,
      absoluteAmount,
      isPending: false,
      driver: DRIVER_NAME,
    }

    if (rawDescription === "Top Up") {
      // Top Up GrabPay, yield as a credit
      const description = `GrabPay Top Up - ${paymentMethod}`;
      yield new Transaction({
        ...baseTransaction,
        description,
        displayText: description,
        isDebit: false,
        raw: ["U", date.toString(), row],
      });
    } else {
      let description = "";
      if (rawDescription.startsWith("Paid to")) {
        description = rawDescription.substring(8);
      } else if (!rawDescription.startsWith("Grab")) {
        description = `Grab - ${rawDescription}`;
      } else {
        description = rawDescription;
      }

      // Yield the actual transaction
      yield new Transaction({
        ...baseTransaction,
        description,
        payeeName: description,
        isDebit: isDebitFromGrabPay,
        raw: ["T", date.toString(), row],
      });

      // This transaction was performed using non-wallet
      // Emulate a GrabPay topup
      if (paymentMethod) {
        const description = `GrabPay Top Up for ${rawDescription}`;
        yield new Transaction({
          ...baseTransaction,
          description,
          displayText: description,
          isDebit: !isDebitFromGrabPay,
          raw: ["R", date.toString(), row],
        });
      }
    }
  }
}

export default defineDriver({
  name: DRIVER_NAME,

  supportsSource: (source) =>
    !!(source.from === "no-reply@grab.com" && source.server &&
      source.username && source.password && source.port && source.folder),

  async *fetchArtifacts({ source, logger }) {
    const messages = fetchMessages(
      source as object as {
        server: string;
        username: string;
        password: string;
        port: number;
      },
      source.folder as string,
      logger,
    );

    for await (const msg of messages) {
      if (msg.raw) {
        const { date } = await parseMessageRaw(msg.raw);
        yield [`messages/${date.toString()}.eml`, msg.raw];
      }
    }
  },

  async *parseArtifacts({ source, logger }, artifacts) {
    for await (const { name, readable } of artifacts) {
      if (!readable) continue;

      try {
        const { date, rows } = await parseMessageRaw(readable);
        yield* loadTransactionsGenerator(
          source.username as string,
          date,
          rows,
        );
      } catch (_error) {
        logger.error(`Failed to parse artifact: ${name}`);
      }
    }
  },
});
