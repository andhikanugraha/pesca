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
}
