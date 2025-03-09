import { stringify as stringifyCsv } from "@std/csv";
import type { Page } from "playwright";
import * as cheerio from "cheerio";

import { defineDriver, parseFloatSafely, Transaction } from "../lib.ts";

/*
notes:
waitFor #cmlink_lk_myCiti - if not there, then scraping was detected
*/

async function waitOrRefresh(
  page: Page,
  locatorString: string,
  timeout = 7000,
  retries = 5,
): Promise<void> {
  const locator = page.locator(locatorString);

  try {
    // Either return immediately or wait until timeout
    await locator.waitFor({ timeout });
  } catch {
    // timed out
    await page.reload();
    if (retries > 0) {
      // Recursively try again up to `retries`
      await waitOrRefresh(page, locatorString, timeout, retries - 1);
    }
  }
}

async function processSignIn({
  setTitle,
  page,
  username,
  password,
}: {
  setTitle: (title: string) => void;
  page: Page;
  username: string;
  password: string;
}): Promise<void> {
  await waitOrRefresh(page, "#username");

  await page.waitForTimeout(1200);

  const usernameInput = page.locator("#username");
  await usernameInput.click();
  await usernameInput.pressSequentially(username);

  const passwordInput = page.locator("#password");
  await passwordInput.click();
  await passwordInput.pressSequentially(password);

  await page.waitForTimeout(1100);

  const signInButton = page.locator("#link_lkSignOn");
  await signInButton.hover();
  await signInButton.click();

  setTitle("Signed in as " + username);
}

async function processViewAccount(
  { page, setTitle }: { page: Page; setTitle: (title: string) => void },
): Promise<void> {
  const locatorString = "#cmlink_AccountNameLink";
  await waitOrRefresh(page, locatorString);

  const accountNameLink = page.locator(locatorString);
  const accountName = await accountNameLink.innerText();
  setTitle("Opening " + accountName);
  await accountNameLink.hover();
  await accountNameLink.click();

  await page.waitForTimeout(1000);

  setTitle("Opened " + accountName);
}

async function processTransactionsTable(
  { page, setStatus }: { page: Page; setStatus: (status: string) => void },
) {
  await waitOrRefresh(page, "#postedTansactionTable table");

  const noMoreTrans = page.locator("#noMoreTrans");
  const seeMoreActivity = page.locator("#cmlink_SeeMoreActivityLink");
  let stop = false;
  let remainingAttempts = 50;
  let cursor = 1;
  while (!stop && remainingAttempts > 0) {
    remainingAttempts--;
    setStatus(`Loading page ${++cursor}`);
    await seeMoreActivity.click();
    await page.waitForTimeout(2000);

    if (await noMoreTrans.isVisible()) {
      stop = true;
    }

    setStatus("Loaded page " + cursor);
  }
}

function parseTable(tableHTML: string): [string[][], Transaction[]] {
  const $ = cheerio.load(tableHTML, null, false);
  const tbody = $("tbody");

  // remove unnecessary elements
  $("span.cA-sortText", tbody).remove();
  $("td.cT-bodyTableColumn0", tbody).remove();

  // remove pending rows as they are not yet settled
  // $('tr.pending', tbody).remove();

  function parseRow(tr: unknown): string[] {
    const row = $(tr as string);

    const classes = row.attr("class");
    const maskedPAN = classes?.match(/xxxxxxxxxxxx([0-9]{4})/)?.[0] || "";

    const cells: string[] = [maskedPAN];

    $("td", row).each(function () {
      cells.push($(this).text());
    });

    const pending = classes?.match(/pending/);
    cells.push(pending ? "pending" : "");

    return cells;
  }

  function parseNumber(str: string): string {
    // SGD 1,234.56
    str = str.substring(4);
    str = str.replace(",", "");
    return str;
  }

  // CSV rows emulating a CSV download
  const csvRows: string[][] = [];
  const transactions: Transaction[] = [];
  $("tr", tbody).each(function () {
    const parsedRow = parseRow(this);
    if (!parsedRow[1]) {
      return;
    }

    const [maskedPAN, rawDate, remarks, rawDebit, rawCredit, pending] =
      parsedRow;

    const debit = "-" + parseNumber(rawDebit);
    const credit = parseNumber(rawCredit);
    const amountString = credit || debit;

    // Add CSV row emulating a CSV download
    if (!pending) {
      csvRows.push([rawDate, remarks, amountString, "", maskedPAN]);
    }

    // Parse the transaction
    const [d, m, y] = rawDate.split("/");
    const date = new Temporal.PlainDate(parseInt(y), parseInt(m), parseInt(d));

    // parse amount
    const amount = Math.abs(parseFloatSafely(amountString));
    const isDebit = amountString[0] === "-";

    const isPending = !!pending;

    const account = `Citi ` + maskedPAN.substring(maskedPAN.length - 4);
    const transaction = new Transaction(
      account,
      date,
      remarks,
      amount,
      isDebit,
      isPending,
    );

    transactions.unshift(transaction);
  });

  return [csvRows, transactions];
}

export default defineDriver({
  name: "citibank.com.sg",
  supportsSource: (source) => !!source.website?.includes("citibank.com.sg"),
  async pull({ task, page, source, storeArtifact }) {
    if (!source.username || !source.password) {
      throw new Error("No username/password specified.");
    }

    const username = source.username;
    const password = source.password;

    let tableHTML: string = "";
    let csvRows: string[][] = [];
    let transactions: Transaction[] = [];

    const URL =
      "https://www.citibank.com.sg/SGGCB/JSO/username/signon/flow.action";

    await task.group((task) => [
      task(
        `Opening ${URL}`,
        () => page.goto(URL),
      ),
      task(
        "Signing in as " + username,
        ({ setTitle }) => processSignIn({ setTitle, page, username, password }),
      ),
      task(
        "Opening account",
        ({ setTitle }) => processViewAccount({ page, setTitle }),
      ),
      task(
        "Expanding transactions table",
        ({ setStatus }) => processTransactionsTable({ page, setStatus }),
      ),
      task(
        "Getting table HTML",
        async () => {
          tableHTML = await page
            .locator("#postedTansactionTable table")
            .innerHTML();

          storeArtifact("table.html", tableHTML);
        },
      ),
      task(
        "Signing off",
        () => page.locator("#signoff-button").click(),
      ),
      task(
        "Parsing table",
        () => {
          [csvRows, transactions] = parseTable(tableHTML);
          return Promise.resolve();
        },
      ),
      task(
        "Writing CSV",
        () => storeArtifact("table.csv", stringifyCsv(csvRows)),
      ),
    ]);

    return { transactions };
  },
});
