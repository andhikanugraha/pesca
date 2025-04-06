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
  parseFloatSafely,
  Transaction,
} from "../lib.ts";

const DRIVER_NAME = "grabpay";

function parseStatementDate(date: string): Temporal.PlainDate {
  const parts = date.split(" ");
  if (parts.length !== 3) {
    throw new Error('Invalid short date format. Expected "DD Mon YYYY".');
  }

  const day = parseInt(parts[0], 10);
  const monthAbbreviation = parts[1];
  const year = parseInt(parts[2], 10);

  const monthMap: Record<string, number> = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
  };

  const month = monthMap[monthAbbreviation];

  if (!month) {
    throw new Error(`Invalid month abbreviation: ${monthAbbreviation}`);
  }

  return new Temporal.PlainDate(year, month, day);
}

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

async function parseMessageRaw(raw: Uint8Array) {
  // Parse the EML file using postal-mime
  const parsedEmail = await PostalMime.parse(raw);

  // Get the HTML content of the email message
  const htmlContent = parsedEmail.html || "";

  // Get the date of the statement
  const $a = load(htmlContent);
  const dateText = $a("td[width=240]").text().trim();
  const date = parseStatementDate(dateText);

  const rows = getTransactionRows(htmlContent);

  return { date, rows };
}

function loadTransactions(
  transactions: Transaction[],
  account: string,
  date: Temporal.PlainDate,
  rows: string[][],
) {
  for (const row of rows) {
    const [_, rawDescription, paymentMethod, amount] = row;
    const amountFloat = parseFloatSafely(amount);
    const isDebitFromGrabPay = amountFloat < 0;
    const absoluteAmount = Math.abs(amountFloat);

    if (rawDescription === "Top Up") {
      // Top Up GrabPay, record as a credit
      transactions.push(
        new Transaction(
          account,
          date,
          `GrabPay Top Up - ${paymentMethod}`,
          absoluteAmount,
          false,
          false,
          DRIVER_NAME,
          ["U", date.toString(), row],
        ),
      );
    } else {
      let description = "";
      if (rawDescription.startsWith("Paid to")) {
        description = rawDescription.substring(8);
      } else if (!rawDescription.startsWith("Grab")) {
        description = `Grab - ${rawDescription}`;
      } else {
        description = rawDescription;
      }

      // The actual transaction
      transactions.push(
        new Transaction(
          account,
          date,
          description,
          absoluteAmount,
          isDebitFromGrabPay,
          false,
          DRIVER_NAME,
          ["T", date.toString(), row],
        ),
      );

      // This transaction was performed using non-wallet
      // Emulate a GrabPay topup
      if (paymentMethod) {
        transactions.push(
          new Transaction(
            account,
            date,
            `GrabPay Top Up for ${rawDescription}`,
            absoluteAmount,
            !isDebitFromGrabPay,
            false,
            DRIVER_NAME,
            ["R", date.toString(), row],
          ),
        );
      }
    }
  }

  return transactions;
}

export default defineDriver({
  name: DRIVER_NAME,

  supportsSource: (source) =>
    !!(source.from === "no-reply@grab.com" && source.server &&
      source.username && source.password && source.port && source.folder),

  transactionMeta: (t) => ({ payeeName: t.description }),

  async pull({ source, storeArtifact, logger }) {
    const messages = fetchMessages(
      source as object as {
        server: string;
        username: string;
        password: string;
        port: number;
      },
      source.folder as string,
      logger
    );

    const transactions: Transaction[] = [];
    for await (const msg of messages) {
      if (msg.raw) {
        const { date, rows } = await parseMessageRaw(msg.raw);
        await storeArtifact(`messages/${date.toString()}.eml`, msg.raw);
        loadTransactions(transactions, source.username as string, date, rows);
      }
    }

    return { transactions };
  },
});
