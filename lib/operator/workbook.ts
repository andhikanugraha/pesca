import { Transaction } from "./transaction.ts";

type TransactionRow = [string, Date, string, number, string];
type TransactionToCategoryMapper = (t: Transaction) => string;

// @ts-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from "xlsx";

// iterate across months
function getMonthIndex(transaction: Transaction) {
  return Temporal.PlainYearMonth.from(transaction.date).toString();
}

function toDate(plain: Temporal.PlainDate): Date {
  const zoned = plain.toZonedDateTime(Temporal.Now.timeZoneId());
  return new Date(zoned.epochMilliseconds);
}

function toRow(t: Transaction): TransactionRow {
  return [
    t.account,
    toDate(t.date),
    t.description,
    t.amount,
    "",
  ];
}

export function generateWorkbook(
  transactions: Transaction[],
) {
  const workbook = XLSX.utils.book_new();

  const months = new Map<string, TransactionRow[]>();
  for (const transaction of transactions) {
    const monthIndex = getMonthIndex(transaction);

    if (!months.get(monthIndex)) {
      months.set(monthIndex, []);
    }

    const month = months.get(monthIndex);
    if (month) {
      month.push(toRow(transaction));
    }
  }

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
      XLSX.utils.book_append_sheet(workbook, worksheet, month);
    }
  }

  return XLSX.writeXLSX(workbook, { type: "buffer" });
}
