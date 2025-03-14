import { JsonValue } from "@std/json";
import { CsvStringifyStream } from "@std/csv";

export interface TransactionMeta {
  displayText?: string;
  reference?: string;
  payeeName?: string;
  payeeCity?: string;
  payeeCountryCode?: string;
  originalCurrencyCode?: string;
  originalCurrencyAmount?: number;
}

export class Transaction {
  account: string;
  date: Temporal.PlainDate;
  description: string;
  absoluteAmount: number;
  isDebit: boolean;
  isPending: boolean;
  driver: string;
  raw: unknown;

  constructor(
    account: string,
    date: Temporal.PlainDate,
    description: string,
    absoluteAmount: number,
    isDebit = true,
    isPending = false,
    driver = "",
    raw: unknown = null,
  ) {
    this.account = account;
    this.date = date;
    this.description = description;
    this.absoluteAmount = absoluteAmount;
    this.isDebit = isDebit;
    this.isPending = isPending;
    this.driver = driver;
    this.raw = raw;
  }

  get amount() {
    return (this.isDebit ? 1 : -1) * this.absoluteAmount;
  }

  static from({
    account,
    date,
    description,
    absoluteAmount,
    isDebit,
    isPending,
    driver = "",
    raw = null,
  }: {
    account: string;
    date: string;
    description: string;
    absoluteAmount: number;
    isDebit: boolean;
    isPending: boolean;
    driver?: string;
    raw?: unknown;
  }) {
    return new Transaction(
      account,
      Temporal.PlainDate.from(date),
      description,
      absoluteAmount,
      isDebit,
      isPending,
      driver,
      raw,
    );
  }

  // Revive Transaction objects from JSON
  static reviver(_key: string, value: JsonValue) {
    if (
      value === null || typeof value !== "object" ||
      !("date" in (value as object))
    ) {
      return value;
    }

    return Transaction.from(
      value as {
        account: string;
        date: string;
        description: string;
        absoluteAmount: number;
        isDebit: boolean;
        isPending: boolean;
        payee: string;
      },
    );
  }

  static toCsvStream(transactions: Transaction[]): ReadableStream {
    const source = ReadableStream.from(transactions.map((t) => [
      t.date.toString(),
      t.description,
      t.amount,
      t.account,
      t.isPending ? "pending" : "cleared",
    ]));

    return source.pipeThrough(new CsvStringifyStream());
  }
}
