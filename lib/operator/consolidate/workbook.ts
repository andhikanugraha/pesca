// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

import type { EnrichedTransaction } from "../consolidate.ts";

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

export async function loadManualMap(
  path: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const u8 = await Deno.readFile(path);
  const workbook = XLSX.read(u8);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);
  for (const row of rows) {
    const { Payee, Category, AutoCategory } = row;
    if (Category?.trim() && Category !== AutoCategory) {
      map.set(Payee, Category?.trim());
    }
  }

  return map;
}

type TColumn = [title: string, width?: number | null];
type TRow = (string | number | Date | undefined)[];

function generateWorksheet(
  headerSpec: TColumn[],
  rows: TRow[],
): XLSX.WorkSheet {
  const header = headerSpec.flatMap((col) => col[0]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows], {
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });

  sheet["!cols"] = headerSpec.map(([_, wch]) => {
    if (wch === null) return { hidden: true };
    if (wch !== undefined) return { wch };
  }) as XLSX.ColInfo[];

  const numberFormat = "#,##0.00_);\\(#,##0.00\\)";
  for (const cell of Object.values(sheet) as Record<string, string>[]) {
    if (cell.t && cell.t === "n") {
      cell.z = numberFormat;
    }
  }

  sheet["!autofilter"] = {
    ref: sheet["!ref"] as string,
  };

  return sheet;
}

export function generateWorkbook(
  transactions: EnrichedTransaction[],
  manualMap: Map<string, string>
): Uint8Array {
  const workbook = XLSX.utils.book_new();

  const sheet1 = generateWorksheet(
    [
      ["Account", 20],
      ["Date", 10],
      ["Payee", 40],
      ["Amount", 10],
      ["Category", 20],
      ["AutoCategory", null],
      ["Description", null],
      ["Reference", 40],
      ["Original Currency Code", 5],
      ["Original Currency Amount", 16],
    ],
    transactions.map((t) => [
      t.account,
      toDate(t.date),
      t.meta.payeeName ?? t.meta.displayText ?? t.description,
      t.amount,
      t.category,
      t.originalCategory, // this should differentiate
      t.description,
      t.meta.reference,
      t.meta.originalCurrencyCode,
      t.meta.originalCurrencyAmount,
    ]),
  );
  XLSX.utils.book_append_sheet(workbook, sheet1, "Transactions");

  const sheet2 = generateWorksheet(
    [
      ["Payee", 40],
      ["Category", 20]
    ],
    [...manualMap.entries()]
  );
  XLSX.utils.book_append_sheet(workbook, sheet2, "Categorisation");

  return XLSX.writeXLSX(workbook, { type: "buffer", cellStyles: true });
}
