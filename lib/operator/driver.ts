import { SourceParams } from "../config.ts";
import citi from "./drivers/citi.ts";
import dbs from "./drivers/dbs.ts";
import grabpay from "./drivers/grabpay.ts";
import { DriverDefinition } from "./lib.ts";
import type { Transaction, TransactionMeta } from "./transaction.ts";

const drivers: DriverDefinition[] = [citi, dbs, grabpay];
const driverMap: Record<string, DriverDefinition> = {};
for (const driver of drivers) {
  driverMap[driver.name] = driver;
}

export function selectDriver(
  source: SourceParams,
): DriverDefinition | undefined {
  for (const driver of drivers) {
    if (driver.supportsSource(source)) {
      return driver;
    }
  }
}

export function getTransactionMeta(t: Transaction): TransactionMeta {
  const driver = driverMap[t.driver];
  if (!driver) {
    return {};
  }
  return driver.transactionMeta(t);
}
