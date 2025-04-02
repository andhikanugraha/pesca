// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

import type { Transaction } from "../transaction.ts";
import getRuleMapper from "./rules.ts";
import { ensureFile } from "@std/fs";
import { getTransactionMeta } from "../driver.ts";

type Row = [
  string,
  Date,
  string,
  number,
  string,
  string,
  string,
  string,
  string,
  number | undefined,
];
type Mapper = (t: Transaction) => string;

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

function applyWidths(
  sheet: XLSX.WorkSheet,
  ...widths: (number | null)[]
): XLSX.WorkSheet {
  sheet["!cols"] = [];
  const cols = sheet["!cols"];
  widths.forEach((wch, i) => {
    if (wch !== null) {
      cols[i] = { wch };
    } else {
      cols[i] = { hidden: true };
    }
  });
  return sheet;
}

async function loadOverrideMapper(
  path: string,
): Promise<[Mapper, Map<string, string>]> {
  const map = new Map<string, string>();
  const u8 = await Deno.readFile(path);
  const workbook = XLSX.read(u8);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet) as Record<
    string,
    string | number
  >[];
  for (const row of rows) {
    const { Description, Category, AutoCategory } = row as Record<
      string,
      string
    >;
    if (Category?.trim() && Category !== AutoCategory) {
      map.set(Description, Category?.trim());
    }
  }
  await Deno.truncate(path);

  return [
    (t: Transaction) => map.get(t.description) || "",
    map,
  ];
}

function generateWorkbook(
  transactionRows: Row[],
  overrideRows: Iterable<[string, string]>,
): Uint8Array {
  const workbook = XLSX.utils.book_new();

  // Transactions worksheet
  const sheet1 = generateTransactionWorksheet(transactionRows);
  XLSX.utils.book_append_sheet(workbook, sheet1, "Transactions");

  // Payees worksheet
  const payees = new Set(transactionRows.map((row) => row[2]));
  const sortedPayees = [...payees].sort();
  const sheet2 = XLSX.utils.aoa_to_sheet([
    ["Payee", "Category"],
    ...sortedPayees.map((p) => [p]),
  ]);
  applyWidths(sheet2, 40, 20);
  XLSX.utils.book_append_sheet(workbook, sheet2, "Payees");

  const sheet3 = XLSX.utils.aoa_to_sheet([
    ["Description", "Category"],
    ...overrideRows,
  ]);
  applyWidths(sheet3, 40, 20);
  XLSX.utils.book_append_sheet(workbook, sheet3, "Categorisation");

  return XLSX.writeXLSX(workbook, { type: "buffer", cellStyles: true });
}

function generateTransactionWorksheet(transactionRows: Row[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "Account",
      "Date",
      "Payee",
      "Amount",
      "Category",
      "AutoCategory",
      "Description",
      "Reference",
      "Original Currency Code",
      "Original Currency Amount",
    ],
    ...transactionRows,
  ], {
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });
  applyWidths(sheet, 20, 10, 40, 10, 20, null, null, 20, 5, 10);
  const amountColumns = ["D", "J"];
  for (let row = 2; row <= transactionRows.length + 1; row++) {
    for (const col of amountColumns) {
      const cell = sheet[`${col}${row}`];
      if (cell) cell.z = "#,##0.00_);\\(#,##0.00\\)";
    }
  }

  // Add autofilter
  sheet["!autofilter"] = {
    ref: sheet["!ref"] as string,
  };

  return sheet;
}

function toRow(t: Transaction, map: Mapper, overrideMap: Mapper): Row {
  const meta = getTransactionMeta(t);
  return [
    t.account,
    toDate(t.date),
    meta.displayText || meta.payeeName || t.description,
    t.amount,
    overrideMap(t) || map(t),
    map(t),
    t.description,
    meta.reference || "",
    meta.originalCurrencyCode || "",
    meta.originalCurrencyAmount,
  ];
}

export async function writeWorkbooks(
  transactions: Transaction[],
  rules: string,
  path: string,
): Promise<void> {
  const defaultMapper = getRuleMapper(rules);
  const [overrideMapper, overrideMap] = await loadOverrideMapper(path);

  const transactionRows = transactions.map((t) =>
    toRow(t, defaultMapper, overrideMapper)
  );
  const workbook = generateWorkbook(transactionRows, overrideMap);
  await ensureFile(path);
  await Deno.writeFile(path, workbook);
}
