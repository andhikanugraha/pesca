// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

import type { Transaction } from "../transaction.ts";
import getRuleMapper from "./rules.ts";
import { getOrSet } from "./map.ts";
import { ensureFile, expandGlob } from "@std/fs";
import { resolve } from "@std/path/resolve";

type Row = [string, Date, string, number, string, string];
type Mapper = (t: Transaction) => string;

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

type Year = string;
function rowsByYear(
  transactions: Transaction[],
  mapper: Mapper,
  overrideMap: Mapper,
): Map<Year, Row[]> {
  const map = new Map<Year, Row[]>();
  for (const transaction of transactions) {
    const key = transaction.date.year.toString();
    const year = getOrSet(map, key, []);
    year.push(toRow(transaction, mapper, overrideMap));
  }

  return map;
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
  baseDir: string,
): Promise<[Mapper, Map<string, string>]> {
  const map = new Map<string, string>();
  for await (const file of expandGlob(`${baseDir}/*.xlsx`)) {
    const { path } = file;
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
      if (Category.trim() && Category !== AutoCategory) {
        map.set(Description, Category.trim());
      }
    }
  }

  return [
    (t: Transaction) => map.get(t.description) || "",
    map,
  ];
}

function generateWorkbook(
  transactionRows: Iterable<Row>,
  overrideRows: Iterable<[string, string]>,
): Uint8Array {
  const workbook = XLSX.utils.book_new();

  const sheet1 = XLSX.utils.aoa_to_sheet([
    ["Account", "Date", "Description", "Amount", "Category", "AutoCategory"],
    ...transactionRows,
  ], {
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });
  applyWidths(sheet1, 20, 10, 65, 10, 20, null);
  XLSX.utils.book_append_sheet(workbook, sheet1, "Transactions");

  const sheet2 = XLSX.utils.aoa_to_sheet([
    ["Description", "Category"],
    ...overrideRows,
  ]);
  applyWidths(sheet2, 65, 20);
  XLSX.utils.book_append_sheet(workbook, sheet2, "Categories");

  return XLSX.writeXLSX(workbook, { type: "buffer", cellStyles: true });
}

function toRow(t: Transaction, map: Mapper, overrideMap: Mapper): Row {
  return [
    t.account,
    toDate(t.date),
    t.description,
    t.amount,
    overrideMap(t) || map(t),
    map(t),
  ];
}
export async function writeWorkbooksByYear(
  transactions: Transaction[],
  rules: string,
  baseDir: string,
): Promise<void> {
  const defaultMapper = getRuleMapper(rules);
  const [overrideMapper, overrideMap] = await loadOverrideMapper(baseDir);
  const transactionsByYear = rowsByYear(
    transactions,
    defaultMapper,
    overrideMapper,
  );

  for (const [year, transactionRows] of transactionsByYear) {
    const workbook = generateWorkbook(transactionRows, overrideMap);
    const path = resolve(baseDir, `${year}.xlsx`);
    await ensureFile(path);
    await Deno.writeFile(path, workbook);
  }
}
