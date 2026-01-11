import { DriverDefinition } from "./lib.ts";
import { SourceParams } from "../config.ts";

import citi from "./drivers/citi.ts";
import dbs from "./drivers/dbs.ts";
import grabpay from "./drivers/grabpay.ts";
import hsbc from "./drivers/hsbc.ts";

const drivers: DriverDefinition[] = [citi, dbs, hsbc, grabpay];

export function selectDriver(
  source: SourceParams,
): DriverDefinition | undefined {
  return drivers.find((driver) => driver.supportsSource(source));
}
