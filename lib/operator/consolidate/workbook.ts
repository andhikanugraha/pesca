// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

import type { Transaction } from "../transaction.ts";
import getRuleMapper from "./rules.ts";

type TransactionRow = [string, Date, string, number, string];
type TransactionToCategoryMapper = (t: Transaction) => string;

// iterate across months
function getMonthIndex(transaction: Transaction) {
  return Temporal.PlainYearMonth.from(transaction.date).toString();
}

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

function toRow(
  t: Transaction,
  map: TransactionToCategoryMapper,
): TransactionRow {
  return [
    t.account,
    toDate(t.date),
    t.description,
    t.amount,
    map(t),
  ];
}

function groupByMonth(
  transactions: Transaction[],
  mapper: TransactionToCategoryMapper,
): Map<string, TransactionRow[]> {
  const months = new Map<string, TransactionRow[]>();
  for (const transaction of transactions) {
    const monthIndex = getMonthIndex(transaction);

    if (!months.get(monthIndex)) {
      months.set(monthIndex, []);
    }

    const month = months.get(monthIndex);
    if (month) {
      month.push(toRow(transaction, mapper));
    }
  }

  return months;
}

function applyWidths(ws: XLSX.WorkSheet, ...widths: number[]): XLSX.WorkSheet {
  ws["!cols"] = [];
  const cols = ws["!cols"];
  widths.forEach((wch, i) => {
    cols[i] = { wch };
  });
  return ws;
}

export function generateWorkbook(transactions: Transaction[], rules: string) {
  const workbook = XLSX.utils.book_new();

  const mapper = getRuleMapper(rules);

  const months = groupByMonth(transactions, mapper);
  const sortedMonthIndices = [...months.keys()].sort();

  for (const month of sortedMonthIndices) {
    const list = months.get(month);
    if (list) {
      const rows = [
        ["Account", "Date", "Description", "Amount", "Category"],
        ...list,
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(rows, {
        cellDates: true,
        dateNF: "yyyy-mm-dd",
      });

      applyWidths(worksheet, 20, 10, 65, 10, 20);

      XLSX.utils.book_append_sheet(workbook, worksheet, month);
    }
  }

  return XLSX.writeXLSX(workbook, { type: "buffer", cellStyles: true });
}
