export class Transaction {
  account: string;
  date: Temporal.PlainDate;
  description?: string;
  absoluteAmount: number;
  isDebit: boolean;
  isPending: boolean;
  raw: string | (string | string[])[];

  displayText?: string;
  reference?: string;
  payeeName?: string;
  payeeCity?: string;
  payeeCountryCode?: string;
  originalCurrencyCode?: string;
  originalCurrencyAmount?: number;
  statementDate?: Temporal.PlainDate;

  [prop: string]: unknown;

  constructor(
    props: Partial<Transaction> & {
      // Required fields
      account: string;
      date: Temporal.PlainDate | string;
      absoluteAmount: number;
      raw: string | (string | string[])[];
    },
  ) {
    this.account = props.account;
    this.date = Temporal.PlainDate.from(props.date);
    this.absoluteAmount = props.absoluteAmount;
    this.raw = props.raw;

    this.description = props.description ?? "";
    this.isDebit = props.isDebit ?? true;
    this.isPending = props.isPending ?? false;

    // Former TransactionMeta fields
    Object.assign(this, props);
  }

  get amount() {
    return (this.isDebit ? 1 : -1) * this.absoluteAmount;
  }

  static sort(a: Transaction, b: Transaction) {
    return Temporal.PlainDate.compare(a.date, b.date);
  }
}
