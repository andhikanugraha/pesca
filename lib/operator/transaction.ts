import { JsonValue } from "@std/json";
import { CsvStringifyStream } from "@std/csv";

export class Transaction {
  account: string;
  date: Temporal.PlainDate;
  description: string;
  absoluteAmount: number;
  isDebit: boolean;
  isPending: boolean;

  constructor(
    account: string,
    date: Temporal.PlainDate,
    description: string,
    absoluteAmount: number,
    isDebit = true,
    isPending = false,
  ) {
    this.account = account;
    this.date = date;
    this.description = description;
    this.absoluteAmount = absoluteAmount;
    this.isDebit = isDebit;
    this.isPending = isPending;
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
  }: {
    account: string;
    date: string;
    description: string;
    absoluteAmount: number;
    isDebit: boolean;
    isPending: boolean;
  }) {
    return new Transaction(
      account,
      Temporal.PlainDate.from(date),
      description,
      absoluteAmount,
      isDebit,
      isPending,
    );
  }

  // Revive Transaction objects from JSON
  static reviver(_key: string, value: JsonValue) {
    if (typeof value !== "object" || !("date" in (value as object))) {
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
