import { Transaction } from "../transaction.ts";

// type aliases to improve readability
type FPath = string;
type TKey = string;

function getTransactionKey(t: Transaction): TKey {
  const { date, description, account, amount } = t;
  return `${account}\x1F${date.toString()}\x1F${description}\x1F${amount}`;
}

function getOrSet<K, T>(map: Map<K, T>, key: K, value: T): T {
  if (map.has(key)) return map.get(key) as T;

  map.set(key, value);
  return value;
}

export function deduplicateTransactions(
  fileTransactionsMap: Map<FPath, Transaction[]>,
): Transaction[] {
  const tKeyToFile: Map<TKey, Map<FPath, Transaction[]>> = new Map();
  const deduplicatedTransactions: Transaction[] = [];

  for (const [filePath, transactions] of fileTransactionsMap) {
    const clearedTransactions = transactions.filter((t) => !t.isPending);
    for (const transaction of clearedTransactions) {
      const transactionKey = getTransactionKey(transaction);
      const fileToUniqTrx = getOrSet(tKeyToFile, transactionKey, new Map());
      const transactionsInThisFile = getOrSet(fileToUniqTrx, filePath, []);
      transactionsInThisFile.push(transaction);
    }
  }

  for (const [_, fileToUniqTrx] of tKeyToFile) {
    let latestFilePath = "";
    for (const filePath of fileToUniqTrx.keys()) {
      if (filePath > latestFilePath) latestFilePath = filePath;
    }
    const list = fileToUniqTrx.get(latestFilePath) as Transaction[];
    for (const transaction of list) {
      deduplicatedTransactions.push(transaction);
    }
  }

  return deduplicatedTransactions.sort((a, b) =>
    Temporal.PlainDate.compare(a.date, b.date)
  ); // Sort by date
}
