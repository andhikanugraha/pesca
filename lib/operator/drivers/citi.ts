import * as cheerio from "cheerio";

import {
  defineDriver,
  type Logger,
  type Page,
  parseFloatSafely,
  Transaction,
  type TransactionMeta,
} from "../lib.ts";

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
  logger,
  page,
  username,
  password,
}: {
  logger: Logger;
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

  logger.info("Signed in as " + username);
}

async function processViewAccount(
  { page, logger }: { page: Page; logger: Logger },
): Promise<void> {
  const locatorString = "#cmlink_AccountNameLink";
  await waitOrRefresh(page, locatorString);

  const accountNameLink = page.locator(locatorString);
  const accountName = await accountNameLink.innerText();
  logger.info("Opening " + accountName);
  await accountNameLink.hover();
  await accountNameLink.click();

  await page.waitForTimeout(1000);
  logger.info("Opened " + accountName);
}

async function loadFullTransactionsTable(
  { page, logger }: { page: Page; logger: Logger },
) {
  await waitOrRefresh(page, "#postedTansactionTable table");

  const noMoreTrans = page.locator("#noMoreTrans");
  const seeMoreActivity = page.locator("#cmlink_SeeMoreActivityLink");
  let stop = false;
  let remainingAttempts = 50;
  let cursor = 1;
  while (!stop && remainingAttempts > 0) {
    remainingAttempts--;
    logger.info(`Loading page ${++cursor}`);

    if (await noMoreTrans.isVisible()) {
      stop = true;
    } else {
      await seeMoreActivity.click();
      await page.waitForTimeout(2000);
    }
  }
}

function parseAmount(str: string, withCurrencyCode = true): number {
  // SGD 1,234.56
  if (withCurrencyCode) str = str.substring(4);
  return parseFloatSafely(str, true);
}

function* parseTransactionsTable(tableHTML: string): Generator<Transaction> {
  const $ = cheerio.load(tableHTML, null, false);
  const tbody = $("tbody");

  // remove unnecessary elements
  $("span.cA-sortText", tbody).remove();
  $("td.cT-bodyTableColumn0", tbody).remove();

  for (const tr of $("tr", tbody)) {
    const row = $(tr);

    const [
      rawDate,
      rawRemarks,
      rawDebit,
      rawCredit,
    ] = $("td", row).map((_, td) => $(td).text().trim());

    if (!rawDate) continue;

    let absoluteAmount = 0;
    let isDebit = true;
    if (rawDebit) {
      isDebit = true;
      absoluteAmount = parseAmount(rawDebit);
    } else {
      isDebit = false;
      absoluteAmount = parseAmount(rawCredit);
    }

    // Parse the transaction
    const [d, m, y] = rawDate.split("/");
    const date = new Temporal.PlainDate(parseInt(y), parseInt(m), parseInt(d));

    const maskedPAN = row.attr("class")?.match(/xxxxxxxxxxxx([0-9]{4})/)?.[0] ??
      "";
    const isPending = row.hasClass("pending");

    let remarks = rawRemarks;
    // Pending transactions are prefixed with an asterisk. This should be omitted.
    if (remarks[0] === "*") {
      remarks = rawRemarks.substring(1);
    }

    const account = `Citi ` + maskedPAN.slice(-4);
    yield new Transaction(
      account,
      date,
      remarks.substring(0, 40),
      absoluteAmount,
      isDebit,
      isPending,
      "citibank.com.sg",
      remarks,
    );
  }
}

function parseRemarks(remarks: string): TransactionMeta {
  remarks = remarks?.trim() || "";
  if (remarks[0] === "*") {
    remarks = remarks.substring(1);
  }

  const fees = [
    "CCY CONVERSION FEE",
    "CITI PAYALL SERVICE FEE",
    "MILES TRANSFER FEE",
    "GST ON MILES TRANSFER FEE",
  ];
  for (const fee of fees) {
    if (remarks.startsWith(fee)) {
      return {
        displayText: fee,
      };
    }
  }

  if (remarks.startsWith("PAYALL RENTAL      -")) {
    return {
      payeeName: remarks.substring(20)
    }
  }

  let reference: string | undefined = undefined;
  let payeeName = remarks.substring(0, 25).trimEnd();
  const payeeCity = remarks.substring(25, 38).trimEnd();
  const payeeCountryCode = remarks.substring(38, 40);

  // Sanitise payeeName
  const gateways = [
    "PAYPAL *",
    "KrisPay*",
    "GOOGLE*",
    "Google ",
    "SNP*",
    "OPN*",
    "FP*",
  ];
  const toTrim = [
    "BUS/MRT",
    "TRANSIT",
  ];
  for (const gateway of gateways) {
    if (payeeName.startsWith(gateway)) {
      payeeName = payeeName.substring(gateway.length).trimStart();
    }
  }
  for (const text of toTrim) {
    if (payeeName.startsWith(text)) {
      payeeName = text;
    }
  }

  if (payeeName.match(/^SINGAPOR[0-9]+$/)) {
    reference = payeeName.substring(8);
    payeeName = "SINGAPORE AIRLINES";
  }

  if (payeeName.match(/^(Grab|NAME-CHEAP\.COM)\*/)) {
    const pos = payeeName.indexOf("*");
    reference = payeeName.substring(pos + 1).trim();
    payeeName = payeeName.substring(0, pos).trim();
  }

  const extra = remarks.substring(41).split(" ");
  let _pan = "";
  let originalCurrencyCode = "";
  let originalCurrencyAmountString = "";
  let originalCurrencyAmount = undefined;
  if (extra.length === 3) {
    [_pan, originalCurrencyCode, originalCurrencyAmountString] = extra;
    originalCurrencyAmount = parseAmount(originalCurrencyAmountString, false);
  } else if (extra.length === 2) {
    [originalCurrencyCode, originalCurrencyAmountString] = extra;
    originalCurrencyAmount = parseAmount(originalCurrencyAmountString, false);
  } else {
    [_pan] = extra;
  }

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
  name: "citibank.com.sg",

  supportsSource: (source) => !!source.website?.includes("citibank.com.sg"),

  transactionMeta: (t) => parseRemarks(t.raw as string),

  async pull({ logger, createPage, source, storeArtifact }) {
    if (!source.username || !source.password) {
      throw new Error("No username/password specified.");
    }

    const { username, password } = source;

    const URL =
      "https://www.citibank.com.sg/SGGCB/JSO/username/signon/flow.action";

    await using page = await createPage();

    logger.info(`Opening ${URL}`);
    await page.goto(URL);

    logger.info("Signing in as " + username);
    await processSignIn({ logger, page, username, password });

    logger.info("Opening account");
    await processViewAccount({ page, logger });

    logger.info("Expanding transactions table");
    await loadFullTransactionsTable({ page, logger });

    logger.info("Getting table HTML");
    const tableHTML = await page.locator("#postedTansactionTable table")
      .innerHTML();
    await storeArtifact("table.html", tableHTML);

    logger.info("Signing off");
    await page.locator("#signoff-button").click();

    logger.info("Parsing table");
    const transactions = [...parseTransactionsTable(tableHTML)];
    logger.info(`Extracted ${transactions.length} transactions`);

    return { transactions };
  },
});
