import { JsonValue } from "@std/json";

export interface TransactionMeta {
  displayText?: string;
  reference?: string;
  payeeName?: string;
  payeeCity?: string;
  payeeCountryCode?: string;
  originalCurrencyCode?: string;
  originalCurrencyAmount?: number;
}

interface TransactionJSON {
  account: string;
  date: string;
  description: string;
  absoluteAmount: number;
  isDebit: boolean;
  isPending: boolean;
  payee: string;
  driver?: string;
  raw?: unknown;
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

  static fromJSON({
    account,
    date,
    description,
    absoluteAmount,
    isDebit,
    isPending,
    driver = "",
    raw = null,
  }: TransactionJSON) {
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

  static sort(a: Transaction, b: Transaction) {
    return Temporal.PlainDate.compare(a.date, b.date);
  }

  // Revive Transaction objects from JSON
  static reviver(_key: string, value: JsonValue) {
    if (
      value === null || typeof value !== "object" ||
      !("date" in (value as object))
    ) {
      return value;
    }

    return Transaction.fromJSON(value as unknown as TransactionJSON);
  }
}
