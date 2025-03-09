// Sync interface for Actual Budget
// This file is imported in Deno, but also spawns itself in Node.js to run some incompatible modules
import process from "node:process";
import { TextLineStream } from "@std/streams";
import type { Transaction } from "../lib.ts";

const PARAMS_ENV = "PARAMS";

export interface ActualParams {
  dataDir: string;
  serverURL: string;
  password: string;
  syncId: string;
  accountMapping: Record<string, string>;
}

interface ActualTransaction {
  date: string; // YYYY-MM-DD
  amount: number;
  payee: string;
  imported_payee: string;
  notes: string;
  cleared: boolean;
}

interface ActualAccountTransactions {
  account: string;
  transactions: ActualTransaction[];
}

export function convertTransaction(
  transaction: Transaction,
): ActualTransaction {
  const sign = transaction.isDebit ? -1 : 1;
  return {
    date: transaction.date.toString(),
    amount: Math.round(transaction.absoluteAmount * 100) * sign,
    notes: transaction.description,
    imported_payee: transaction.description,
    payee: transaction.description,
    cleared: !transaction.isPending,
  };
}

export function spawnSelf(params: ActualParams): Deno.ChildProcess {
  const { filename, dirname } = import.meta;
  if (!filename || !dirname) {
    throw new Error("Unable to spawn Actual client.");
  }
  const command = new Deno.Command("npx", {
    args: ["tsx", import.meta.filename || ""],
    cwd: import.meta.dirname || ".",
    env: { [PARAMS_ENV]: JSON.stringify(params) },
    stdin: "piped",
    stdout: "piped",
  });

  const childProcess = command.spawn();

  return childProcess;
}

function groupTransactionsByAccount(
  accountNames: string[],
  transactions: Transaction[],
): Map<string, Transaction[]> {
  const transactionsByAccount = new Map<string, Transaction[]>();

  for (const accountName of accountNames) {
    transactionsByAccount.set(accountName, []);
  }

  for (const transaction of transactions) {
    const account = transactionsByAccount.get(transaction.account);
    if (account) {
      account.push(transaction);
    } // else the account is not in scope
  }

  return transactionsByAccount;
}

export async function importTransactions(
  params: ActualParams,
  transactions: Transaction[],
): Promise<boolean> {
  const accountTransactions = groupTransactionsByAccount(
    Object.keys(params.accountMapping),
    transactions,
  );

  const textStream = new TextEncoderStream();
  const childProcess = spawnSelf(params);
  textStream.readable.pipeTo(childProcess.stdin);

  const writer = textStream.writable.getWriter();
  for (const [account, rawTransactions] of accountTransactions.entries()) {
    const transactions = rawTransactions.map((t) => convertTransaction(t));
    const payload: ActualAccountTransactions = { account, transactions };
    writer.write(JSON.stringify(payload) + "\n");
  }

  writer.close();

  const { code, stdout } = await childProcess.output();
  console.log(new TextDecoder().decode(stdout));
  return (code === 0);
}

// The following code is only needed in Node context

function createStdinReadableStream() {
  return new ReadableStream({
    start(controller) {
      const { stdin } = process;
      stdin.on("data", (chunk) => controller.enqueue(chunk));
      stdin.on("end", () => controller.close());
      stdin.on("error", (err) => controller.error(err));
    },
  });
}

async function nodeJsMain() {
  const api = await import("@actual-app/api");

  const paramsString = process.env[PARAMS_ENV];
  if (!paramsString) {
    console.error("Invalid input params");
    process.exit(1);
  }

  const contentStream = createStdinReadableStream();

  async function getAccounts(): Promise<Map<string, string>> {
    const accounts = await api.getAccounts();
    const accountNameToId = new Map<string, string>();
    for (const account of accounts) {
      accountNameToId.set(account.name, account.id);
    }
    return accountNameToId;
  }

  async function processAccountMapping(
    accountMapping: Record<string, string>,
  ): Promise<Map<string, string>> {
    const availableAccounts = await getAccounts();
    const accountIdMapping = new Map<string, string>();
    for (const [source, destination] of Object.entries(accountMapping)) {
      if (availableAccounts.has(destination)) {
        accountIdMapping.set(
          source,
          availableAccounts.get(destination) as string,
        );
      } else {
        throw new Error(`Destination account "${destination}" does not exist.`);
      }
    }

    return accountIdMapping;
  }

  async function processTransactions(
    accountNameToId: (accountName: string) => string | undefined,
  ) {
    for await (const line of contentStream.pipeThrough(new TextLineStream())) {
      const { account, transactions } = JSON.parse(line) as {
        account: string;
        transactions: ActualTransaction[];
      };
      const accountId = accountNameToId(account);
      if (accountId) {
        const results = await api.importTransactions(accountId, transactions);

        if (results) {
          console.dir(results);
        }
      }
    }
  }

  try {
    const { dataDir, serverURL, password, syncId, accountMapping }:
      ActualParams = JSON.parse(paramsString);

    await api.init({ dataDir, serverURL, password });
    await api.downloadBudget(syncId);

    // process accountMapping
    // if any mismatch, throw an error
    const accountIdMapping = await processAccountMapping(accountMapping);

    // process stdin here
    await processTransactions((name) => accountIdMapping.get(name));

    process.exit(0);
  } catch (e) {
    await api.sync();
    await api.shutdown();
    console.error(e);
    process.exit(1);
  }
}

// Execute nodeJsMain() if called as main module from Node.js
if (process && process.argv[1] === import.meta.filename) {
  nodeJsMain();
}
