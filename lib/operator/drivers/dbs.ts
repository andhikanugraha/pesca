import { parse as parseCsv } from "@std/csv";
import * as cheerio from "cheerio";
import getStream from "get-stream";

import {
  defineDriver,
  type FrameLocator,
  type NotifyFn,
  type Page,
  parseFloatSafely,
  Transaction,
  type TransactionMeta,
} from "../lib.ts";

const DRIVER_NAME = "dbs.com.sg";

export function parseRowMeta([r0, r1, r2, r3, r4]: string[]): TransactionMeta {
  r4 = r4.substring(5);

  let displayText;
  let payeeName = "";
  let reference = "";

  if (r0 === "ITR" || r0 === "INT") {
    displayText = "Interest";
  } else if (r2.startsWith("TOP-UP TO PAYLAH! :")) {
    payeeName = r3;
  } else if (r0 === "POS" && r1 === "NETS") {
    payeeName = r3;
  } else if (
    (r1 === "POS" && r2.startsWith("NETS ")) ||
    (r1 === "ICT" && r2.startsWith("Incoming PayNow Ref ")) ||
    (r1 === "ICT" && r2.startsWith("PayNow Transfer "))
  ) {
    payeeName = r3?.substring(r3.indexOf(":") + 2);
    if (r4 !== "PayNow Transfer" && r4 !== "OTHR") reference = r4;
  } else if (r0 === "GR" || r0 === "POS") {
    payeeName = r2;
  } else {
    displayText = `${r2} ${r3}`;
  }

  return {
    displayText,
    payeeName: payeeName,
    reference,
  };
}

function parseHeader(headerRow: string[]): {
  ref0: number;
  ref0a: number | undefined;
  ref1: number;
  ref2: number;
  ref3: number;
  isPOSB: boolean;
} {
  const isPOSB = headerRow.includes("Transaction Ref1");

  let ref0: number,
    ref1: number,
    ref2: number,
    ref3: number,
    ref0a: number;

  if (isPOSB) {
    ref0 = ref0a = headerRow.indexOf("Reference");
    ref1 = headerRow.indexOf("Transaction Ref1");
    ref2 = headerRow.indexOf("Transaction Ref2");
    ref3 = headerRow.indexOf("Transaction Ref3");
  } else {
    ref0 = headerRow.indexOf("Statement Code");
    ref0a = headerRow.indexOf("Reference");
    ref1 = headerRow.indexOf("Client Reference");
    ref2 = headerRow.indexOf("Additional Reference");
    ref3 = headerRow.indexOf(" Misc Reference");
  }
  return { ref0, ref0a, ref1, ref2, ref3, isPOSB };
}

async function processLogin(
  { page, username, password }: {
    page: Page;
    username: string;
    password: string;
  },
) {
  await page.goto("https://internet-banking.dbs.com.sg/IB/Welcome");

  await page.locator("#UID").click();
  await page.locator("#UID").fill(username);
  await page.locator("#PIN").click();
  await page.locator("#PIN").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

async function process2FA(
  { notify, key, frame, setTitle }: {
    notify: NotifyFn;
    key: string;
    frame: FrameLocator;
    setTitle: (title: string) => void;
  },
) {
  await notify({
    message: `Scraping ${key}. Please open the DBS app to authenticate.`,
  });
  await frame.getByRole("link", { name: "Authenticate now" }).click();
  setTitle("Waiting for digital token authentication...");

  await frame
    .locator("#userBar")
    .getByText("View Transaction History")
    .click({ timeout: 60000 });
  setTitle("Authenticated");

  await notify({ message: "Authentication successful." });
}

async function getAccounts(frame: FrameLocator) {
  const selectorHTML = await frame.locator("#account_number_select")
    .innerHTML();
  const $ = cheerio.load(selectorHTML, null, false);
  const options = $("option");
  const accounts: [string, string][] = [];
  options.each((_, option) => {
    const value = $(option).attr("value");
    const label = $(option).text().trim();
    if (value && label && !label.includes("Fixed")) {
      accounts.push([value, label]);
    }
  });

  return accounts;
}

async function processAccount(
  { frame, page, optionValue, transactions, label, storeArtifact }: {
    frame: FrameLocator;
    page: Page;
    optionValue: string;
    label: string;
    transactions: Transaction[];
    storeArtifact: (name: string, contents: string) => Promise<void>;
  },
): Promise<void> {
  await frame.locator("#account_number_select").selectOption(optionValue);
  await frame.locator("#currency2").selectOption("SGD");
  await frame.locator("#transPeriod").click();
  await frame.locator("li").filter({ hasText: "Last 6 Months" }).click();
  await frame.getByRole("button", { name: "Go" }).click();
  await page.waitForTimeout(1000);

  async function triggerDownloadCsv() {
    await page.waitForTimeout(1000);
    const downloadPromise = page.waitForEvent("download");
    await frame.getByRole("link", { name: "Download" }).click();
    const download = await downloadPromise;
    const downloadedString = getStream(await download.createReadStream());
    await page.waitForTimeout(1000);

    return downloadedString;
  }

  const csvStrings: string[] = [];
  const tabs = frame.locator("#main-tabs li");
  const tabCount = await tabs.count();
  if (tabCount === 0) {
    csvStrings.push(await triggerDownloadCsv());
  } else {
    for (let i = 0; i < tabCount; i++) {
      const element = tabs.nth(i);
      await element.click();
      csvStrings.push(await triggerDownloadCsv());
    }
  }

  for (const [index, csvString] of csvStrings.entries()) {
    await storeArtifact(`${label} ${index}.csv`, csvString);
    transactions.push(...parseDbsCsv(csvString));
  }
}

export function parseDbsCsv(contents: string): Transaction[] {
  if (!contents.includes("Account Details For:")) {
    throw new Error("Invalid CSV");
  }

  const start = contents.indexOf("Transaction Date,");

  const head = contents.substring(0, start).trim().split("\n");
  const account = head[0].split(",")[1];

  const body = contents.substring(start).trim();
  const rows = parseCsv(body);
  const headerRow = rows.shift();

  if (!headerRow) {
    throw new Error("Invalid CSV");
  }

  const { ref0, ref0a, ref1, ref2, ref3 } = parseHeader(headerRow);

  function buildDescription(row: string[]) {
    const parts: string[] = [];
    if (row[ref0] !== "ITR") parts.push(row[ref0]);
    if (row[ref1]) parts.push(row[ref1]);
    if (row[ref2]) parts.push(row[ref2]);
    if (row[ref3]) parts.push(row[ref3]);

    if (!parts.length) return row[ref0];

    return parts.join(" ").replace(/\s+/g, " ");
  }

  function buildRaw(row: string[]): string[] {
    return [
      row[ref0],
      row[ref0a || ref0],
      row[ref1],
      row[ref2],
      row[ref3],
    ];
  }

  const idxCreditAmount = headerRow.indexOf("Credit Amount");
  const idxDebitAmount = headerRow.indexOf("Debit Amount");

  const transactions: Transaction[] = [];
  for (const cells of rows) {
    // trim each cell
    cells.forEach((v, i) => (cells[i] = v.trim()));

    // parse date
    const rawDate = new Date(cells[0]);
    const date = rawDate.toTemporalInstant().toZonedDateTimeISO(
      "Asia/Singapore",
    ).toPlainDate();

    const rawRefs = buildRaw(cells);

    // parse desc
    const description = buildDescription(cells);

    // parse amount
    const creditAmount = parseFloatSafely(cells[idxCreditAmount]);
    const debitAmount = parseFloatSafely(cells[idxDebitAmount]);
    const absoluteAmount = debitAmount || creditAmount;
    const isDebit = debitAmount > 0;

    transactions.unshift(
      new Transaction(
        account,
        date,
        description,
        absoluteAmount,
        isDebit,
        undefined,
        DRIVER_NAME,
        rawRefs,
      ),
    );
  }

  return transactions;
}

export default defineDriver({
  name: DRIVER_NAME,
  supportsSource: (source) => !!source.website?.includes("dbs.com.sg"),
  transactionMeta: (t) => parseRowMeta(t.raw as string[]),
  async pull({ source, page, storeArtifact, task, notify }) {
    const { username, password } = source;
    if (!username || !password) {
      throw new Error("No username/password provided.");
    }

    task("Logging in", async () => {
      await processLogin({ page, username, password });
    });

    const frame = page
      .frameLocator('frame[name="user_area"]')
      .frameLocator('iframe[name="iframe1"]');

    await task("Initiating digital token prompt", async ({ setTitle }) => {
      await process2FA({ notify, key: source.key || "", frame, setTitle });
    });

    // iterate through options under selector, but ignore deposits (0030)
    const accounts = await getAccounts(frame);

    const transactions: Transaction[] = [];
    await task.group((task) =>
      accounts.map(([optionValue, label]) =>
        task(
          label,
          () =>
            processAccount({
              frame,
              page,
              optionValue,
              label,
              transactions,
              storeArtifact,
            }),
        )
      )
    );

    await page.frameLocator('frame[name="user_area"]')
      .getByRole("link", { name: "Proceed to Logout" }).click();
    await frame.getByRole("button", { name: "Logout Now" }).click();

    return { transactions };
  },
});
