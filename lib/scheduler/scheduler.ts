import { Config, SchedulerParams } from "../config.ts";
import RepeatingInterval from "./repeating-interval.ts";

export type Scheduler = {
  run: (
    customCallback?: ({ signal }: { signal: AbortSignal }) => Promise<boolean>,
  ) => Promise<boolean>;
  abort: () => void;
  get isRunning(): boolean;
  get durationUntilNext(): Temporal.Duration;
  get nextOccurrence(): Temporal.ZonedDateTime | undefined;
  get lastSuccessfulOccurrence(): Temporal.ZonedDateTime | null;
  get lastFailedOccurrence(): Temporal.ZonedDateTime | null;
};

export function createScheduler(
  callback: ({ signal }: { signal: AbortSignal }) => Promise<boolean>,
  config: Config,
): Scheduler {
  // Resolve config
  const defaultFrequency = "P1D";
  const defaultParams: Required<SchedulerParams> = {
    schedule: `R/${Temporal.Now.zonedDateTimeISO("UTC")}/${defaultFrequency}`,
    retryInterval: "PT3H",
  };
  const params = Object.assign(defaultParams, config.scheduler);

  const repeatingInterval = RepeatingInterval.from(params.schedule);
  const retryInterval = Temporal.Duration.from(params.retryInterval);
  const tz = (repeatingInterval.start || repeatingInterval.end)?.timeZoneId ||
    Temporal.Now.timeZoneId();

  const initialOccurrence = repeatingInterval.firstAfter(
    Temporal.Now.zonedDateTimeISO(tz),
  ) || Temporal.Now.zonedDateTimeISO(tz);
  const frequency = repeatingInterval.duration ||
    Temporal.Duration.from(defaultFrequency);

  let nextOccurrence: Temporal.ZonedDateTime = initialOccurrence;
  const intervalId = setInterval(checkAndRun, 60 * 1000); // 1 minute;

  let lastSuccessfulOccurrence: Temporal.ZonedDateTime | null = null;
  let lastFailedOccurrence: Temporal.ZonedDateTime | null = null;

  let isRunning: boolean = false;

  let abortController: AbortController;

  async function run(
    customCallback?: ({ signal }: { signal: AbortSignal }) => Promise<boolean>,
  ) {
    const now = Temporal.Now.zonedDateTimeISO(tz);

    isRunning = true;

    abortController = new AbortController();
    const signal = abortController.signal;
    signal.onabort = () => isRunning = false;

    let success: boolean;
    if (customCallback) {
      success = await customCallback({ signal });
    } else {
      success = await callback({ signal: abortController.signal });
    }

    isRunning = false;

    if (success) {
      lastSuccessfulOccurrence = now;
      nextOccurrence = now.add(frequency);
    } else {
      lastFailedOccurrence = now;
      nextOccurrence = now.add(retryInterval);
    }

    return success;
  }

  function scheduleNextOccurrence() {
    const now = Temporal.Now.zonedDateTimeISO(tz);

    if (Temporal.ZonedDateTime.compare(nextOccurrence, now) <= 0) {
      const maybeNextOccurrence = repeatingInterval.firstAfter(now);
      if (maybeNextOccurrence === null) { // No more occurrences based on the specified schedule
        stop();
      } else {
        nextOccurrence = maybeNextOccurrence;
      }
    }
  }

  async function checkAndRun() {
    const now = Temporal.Now.zonedDateTimeISO(tz);

    if (now.until(nextOccurrence).total("seconds") <= 0) {
      await run();
      scheduleNextOccurrence();
    }
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
    }
  }

  function abort() {
    if (abortController) {
      abortController.abort();
      lastFailedOccurrence = Temporal.Now.zonedDateTimeISO(tz);
    }
  }

  return {
    run,
    abort,
    get isRunning() {
      return isRunning;
    },
    get durationUntilNext() {
      return Temporal.Now.zonedDateTimeISO().until(nextOccurrence);
    },
    get nextOccurrence() {
      return nextOccurrence;
    },
    get lastSuccessfulOccurrence() {
      return lastSuccessfulOccurrence;
    },
    get lastFailedOccurrence() {
      return lastFailedOccurrence;
    },
  };
}
