import { Transaction } from "../transaction.ts";
import { getOrSet } from "./map.ts";
import xxhash from "npm:xxhash-wasm";

// type aliases to improve readability
type FPath = string;
type TKey = string;

export interface DeduplicatedTransaction extends Transaction {
  id: string;
}

const { h32 } = await xxhash();
function hash(input: string): string {
  return h32(input).toString(16).padStart(8, "0");
}

function buildTransactionKey(t: Transaction): TKey {
  const { date, account, amount, raw, description } = t;
  const hashed = hash(JSON.stringify([account, raw || description, amount]));
  return `${date.toString()}-${hashed}`;
}

function buildTransactionId(transactionKey: string, index: number) {
  return `${transactionKey}-${index.toString(16).padStart(2, "0")}`;
}

export function* deduplicateTransactions(
  fileTransactionsMap: Map<FPath, Transaction[]>,
): Generator<DeduplicatedTransaction> {
  const tKeyToFile: Map<TKey, Map<FPath, Transaction[]>> = new Map();

  for (const [filePath, transactions] of fileTransactionsMap) {
    const clearedTransactions = transactions.filter((t) => !t.isPending);
    for (const transaction of clearedTransactions) {
      if (transaction.description[0] === "*") {
        transaction.description = transaction.description.substring(1);
      }
      const transactionKey = buildTransactionKey(transaction);
      const fileToUniqTrx = getOrSet(tKeyToFile, transactionKey, new Map());
      const transactionsInThisFile = getOrSet(fileToUniqTrx, filePath, []);
      transactionsInThisFile.push(transaction);
    }
  }

  for (const [transactionKey, fileToUniqTrx] of tKeyToFile) {
    let latestFilePath = "";
    for (const filePath of fileToUniqTrx.keys()) {
      if (filePath > latestFilePath) latestFilePath = filePath;
    }
    const list = fileToUniqTrx.get(latestFilePath)!;
    for (const [idx, transaction] of list.entries()) {
      const id = buildTransactionId(transactionKey, idx);
      const enriched = Object.assign(transaction, { id });
      yield enriched;
    }
  }
}
