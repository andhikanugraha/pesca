// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

import type { EnrichedTransaction } from "../consolidate.ts";

const EXCEL_EPOCH = Temporal.PlainDate.from("1899-12-31");

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

async function readWorkbook<T = string | number | undefined>(
  path: string,
): Promise<Record<string, T>[]> {
  const u8 = await Deno.readFile(path);
  const workbook = XLSX.read(u8);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, T>>(worksheet);
  return rows;
}

export interface RowWithNotes {
  id: string;
  date: Temporal.PlainDate;
  payee: string;
  amount: number;
  notes: string;
}

export async function loadEdits(
  path: string,
): Promise<
  { payeeToCategory: Map<string, string>; notes: Map<string, RowWithNotes> }
> {
  const payeeToCategory = new Map<string, string>();
  const notes = new Map<string, RowWithNotes>();
  const rows = await readWorkbook(path);
  for (const row of rows) {
    const {
      Payee,
      Category,
      AutoCategory,
      ID,
      Notes,
    } = row as Record<string, string | undefined>;

    if (Payee && Category?.trim() && Category !== AutoCategory) {
      payeeToCategory.set(Payee, Category?.trim());
    }

    if (Payee && ID && Notes?.trim()) {
      const date = EXCEL_EPOCH.add({ days: row.Date as unknown as number });
      notes.set(ID, {
        id: ID,
        date,
        payee: Payee,
        amount: row.Amount as unknown as number,
        notes: Notes?.trim(),
      });
    }
  }

  return { payeeToCategory, notes };
}

type Cell = string | number | Date | undefined;
type CellMapper<T> = (item: T) => Cell;
type ColumnSpec<T> = [
  title: string,
  mapper: CellMapper<T>,
  width?: number | null,
];

function generateWorksheet<T>(
  items: T[],
  headerSpec: ColumnSpec<T>[],
): XLSX.WorkSheet {
  const header: string[] = [];
  const cols: XLSX.ColInfo[] = [];
  const mappers: CellMapper<T>[] = [];
  for (const [idx, col] of headerSpec.entries()) {
    const [title, mapper, wch] = col;
    header[idx] = title;
    mappers[idx] = mapper;
    if (wch === null) {
      cols[idx] = { hidden: true };
    } else if (wch !== undefined) {
      cols[idx] = { wch };
    }
  }

  const rows = items.map((item) => mappers.map((mapper) => mapper(item)));

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows], {
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });

  const numberFormat = "#,##0.00_);\\(#,##0.00\\)";
  for (const cell of Object.values(sheet) as Record<string, string>[]) {
    if (cell.t === "n") cell.z = numberFormat;
  }

  sheet["!cols"] = cols;
  sheet["!autofilter"] = { ref: sheet["!ref"]! };

  return sheet;
}

function payeeCellValue(t: EnrichedTransaction) {
  return t.meta.payeeName || t.meta.displayText || t.description;
}

export function generateWorkbook(
  transactions: EnrichedTransaction[],
  manualMap: Map<string, string>,
  notes: Map<string, RowWithNotes>,
): Uint8Array {
  const workbook = XLSX.utils.book_new();

  const sheet1 = generateWorksheet(transactions, [
    ["Account", (t) => t.account, 10],
    ["Date", (t) => toDate(t.date), 10],
    ["Payee", (t) => payeeCellValue(t), 32],
    ["Amount", (t) => t.amount, 10],
    ["Category", (t) => t.category, 14],
    ["Notes", (t) => t.notes, 30],
    ["ID", (t) => t.id, null],
    ["AutoCategory", (t) => t.originalCategory, null],
    ["Description", (t) => t.description, null],
    ["Reference", (t) => t.meta.reference, 40],
    ["Original Currency Code", (t) => t.meta.originalCurrencyCode, 5],
    ["Original Currency Amount", (t) => t.meta.originalCurrencyAmount, 16],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet1, "Transactions");

  const sheet2 = generateWorksheet([...manualMap.entries()], [
    ["Payee", (e) => e[0], 40],
    ["Category", (e) => e[1], 20],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet2, "Categorisation");

  const sheet3 = generateWorksheet([...notes.values()], [
    ["ID", (t) => t.id, 21],
    ["Date", (t) => toDate(t.date), 10],
    ["Payee", (t) => t.payee, 32],
    ["Amount", (t) => t.amount, 10],
    ["Notes", (t) => t.notes, 30],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet3, "Notes");

  return XLSX.writeXLSX(workbook, { type: "buffer", cellStyles: true });
}
