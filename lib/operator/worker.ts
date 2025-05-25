import { executePull } from "./pull.ts";
import { executeConsolidation } from "./consolidate.ts";
import open from "open";
import { logger } from "../logger.ts";
import { type Config } from "../config.ts";

const TIMEOUT = 5 * 60 * 1000; // 5 minutes

type Command = "pull" | "consolidate";
type Payload = {
  config: Config;
  commands: Command[];
};

const worker = self as unknown as Worker;

worker.onmessage = async (e: MessageEvent) => {
  const payload = e.data as Payload;
  const { config, commands } = payload;
  try {
    setTimeout(() => worker.postMessage({ success: false }), TIMEOUT);
    if (commands.includes("pull")) {
      await executePull(config);
    }
    if (commands.includes("consolidate")) {
      await executeConsolidation(config);
      if (commands.length === 1) {
        open(config.xlsx);
      }
    }
    worker.postMessage({ success: true });
  } catch (error) {
    logger.error(error);
    worker.postMessage({ success: false });
  }
};
