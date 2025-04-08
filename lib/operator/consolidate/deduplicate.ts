import { Transaction } from "../transaction.ts";
import { getOrSet } from "./map.ts";

// type aliases to improve readability
type FPath = string;
type TKey = string;

function getTransactionKey(t: Transaction): TKey {
  const { date, description, account, amount, raw } = t;
  const text = JSON.stringify(raw || description);
  return `${account}\x1F${date.toString()}\x1F${text}\x1F${amount}`;
}

export function deduplicateTransactions(
  fileTransactionsMap: Map<FPath, Transaction[]>,
): Transaction[] {
  const tKeyToFile: Map<TKey, Map<FPath, Transaction[]>> = new Map();
  const deduplicatedTransactions: Transaction[] = [];

  for (const [filePath, transactions] of fileTransactionsMap) {
    const clearedTransactions = transactions.filter((t) => !t.isPending);
    for (const transaction of clearedTransactions) {
      if (transaction.description[0] === "*") {
        transaction.description = transaction.description.substring(1);
      }
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

  return deduplicatedTransactions.sort(Transaction.sort);
}
