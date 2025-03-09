import { parse as parseCsv } from "@std/csv";
import getStream from "get-stream";
import * as cheerio from "cheerio";

import { defineDriver, parseFloatSafely, Transaction } from "../lib.ts";

function parseDbsCsv(contents: string): Transaction[] {
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

  const isPOSB = headerRow.includes("Transaction Ref1");

  let ref0: number, ref1: number, ref2: number, ref3: number;

  if (isPOSB) {
    ref0 = headerRow.indexOf("Reference");
    ref1 = headerRow.indexOf("Transaction Ref1");
    ref2 = headerRow.indexOf("Transaction Ref2");
    ref3 = headerRow.indexOf("Transaction Ref3");
  } else {
    ref0 = headerRow.indexOf("Statement Code");
    ref1 = headerRow.indexOf("Client Reference");
    ref2 = headerRow.indexOf("Additional Reference");
    ref3 = headerRow.indexOf("Misc Reference");
  }

  function buildDescription(row: string[]) {
    const parts: string[] = [];
    if (row[ref0] !== "ITR") parts.push(row[ref0]);
    if (row[ref1]) parts.push(row[ref1]);
    if (row[ref2]) parts.push(row[ref2]);
    if (row[ref3]) parts.push(row[ref3]);

    if (!parts.length) return row[ref0];

    return parts.join(" ").replace(/\s+/g, " ");
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

    // parse desc
    const description = buildDescription(cells);

    // parse amount
    const creditAmount = parseFloatSafely(cells[idxCreditAmount]);
    const debitAmount = parseFloatSafely(cells[idxDebitAmount]);
    const absoluteAmount = debitAmount || creditAmount;
    const isDebit = debitAmount > 0;

    transactions.unshift(
      new Transaction(account, date, description, absoluteAmount, isDebit),
    );
  }

  return transactions;
}

export default defineDriver({
  name: "dbs.com.sg",
  supportsSource: (source) => !!source.website?.includes("dbs.com.sg"),
  async pull({ source, page, storeArtifact, task }) {
    const { username, password } = source;
    if (!username || !password) {
      throw new Error("No username/password provided.");
    }

    task("Logging in", async () => {
      await page.goto("https://internet-banking.dbs.com.sg/IB/Welcome");

      await page.locator("#UID").click();
      await page.locator("#UID").fill(username);
      await page.locator("#PIN").click();
      await page.locator("#PIN").fill(password);
      await page.getByRole("button", { name: "Login" }).click();
    });

    const frame = page
      .frameLocator('frame[name="user_area"]')
      .frameLocator('iframe[name="iframe1"]');

    await task("Initiating digital token prompt", async ({ setTitle }) => {
      await frame.getByRole("link", { name: "Authenticate now" }).click();
      setTitle("Waiting for digital token authentication...");

      await frame
        .locator("#userBar")
        .getByText("View Transaction History")
        .click({ timeout: 60_000 });
      setTitle("Authenticated");
    });

    const selectorHTML = await frame
      .locator("#account_number_select")
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
    // iterate through options under selector, but ignore deposits (0030)

    async function processAccount(optionValue: string): Promise<string[]> {
      await frame.locator("#account_number_select").selectOption(optionValue);
      await frame.locator("#currency2").selectOption("SGD");
      await frame.locator("#transPeriod").click();
      await frame.locator("li").filter({ hasText: "Last 6 Months" }).click();
      await frame.getByRole("button", { name: "Go" }).click();
      await page.waitForTimeout(1000);

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

      return csvStrings;
    }

    async function triggerDownloadCsv() {
      await page.waitForTimeout(1000);
      const downloadPromise = page.waitForEvent("download");
      await frame.getByRole("link", { name: "Download" }).click();
      const download = await downloadPromise;
      const downloadedString = getStream(await download.createReadStream());
      await page.waitForTimeout(1000);

      return downloadedString;
    }

    const transactions: Transaction[] = [];
    await task.group((task) =>
      accounts.map(([value, label]) =>
        task(label, async () => {
          const csvStrings = await processAccount(value);
          for (const [index, csvString] of csvStrings.entries()) {
            await storeArtifact(`${label} ${index}.csv`, csvString);
            transactions.push(...parseDbsCsv(csvString));
          }
        })
      )
    );

    await page
      .frameLocator('frame[name="user_area"]')
      .getByRole("link", { name: "Proceed to Logout" })
      .click();
    await frame.getByRole("button", { name: "Logout Now" }).click();

    return { transactions };
  },
});
