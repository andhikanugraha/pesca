import { Config } from "../config.ts";
import { logger } from "../logger.ts";
import { generateSchedule, isPast, now, parseParams } from "./util.ts";

type ScheduledCallback = (
  { signal }: { signal: AbortSignal },
) => Promise<boolean>;

export interface Scheduler {
  run(customCallback?: ScheduledCallback): Promise<boolean>;
  abort(): void;
  get isRunning(): boolean;
  get durationUntilNext(): Temporal.Duration;
  get nextOccurrence(): Temporal.ZonedDateTime | undefined;
  get lastSuccessfulOccurrence(): Temporal.ZonedDateTime | null;
  get lastFailedOccurrence(): Temporal.ZonedDateTime | null;
}

export function createScheduler(
  callback: ScheduledCallback,
  config: Config,
): Scheduler {
  const { daily, retry, tz, interval } = parseParams(config.schedule);

  const schedule = generateSchedule({ daily, tz });
  let nextOccurrence: Temporal.ZonedDateTime = schedule.next().value!;

  let abortController: AbortController | null = null;
  let lastSuccessfulOccurrence: Temporal.ZonedDateTime | null = null;
  let lastFailedOccurrence: Temporal.ZonedDateTime | null = null;
  let isRunning: boolean = false;
  let intervalId: number = 0;

  function stop() {
    clearInterval(intervalId);
  }

  function abort() {
    if (abortController) {
      abortController.abort();
      lastFailedOccurrence = Temporal.Now.zonedDateTimeISO(tz);
      abortController = null;
    }
  }

  function scheduleNextOccurrence(wasSuccessful: boolean) {
    // now < nextOccurrence: do nothing
    if (!isPast(nextOccurrence)) {
      return;
    }

    if (wasSuccessful) {
      const maybeNextOccurrence = schedule.next().value;
      // No more occurrences based on the specified schedule
      if (!maybeNextOccurrence) stop();
      else nextOccurrence = maybeNextOccurrence;
    } else {
      nextOccurrence = now().add(retry);
    }
  }

  async function run(customCallback?: ScheduledCallback) {
    isRunning = true;

    abortController = new AbortController();
    const signal = abortController.signal;
    signal.addEventListener("abort", () => isRunning = false);

    const success = await (customCallback ?? callback)({ signal });

    isRunning = false;

    if (success) {
      lastSuccessfulOccurrence = now();
    } else {
      lastFailedOccurrence = now();
    }

    return success;
  }

  async function checkAndRun() {
    if (isPast(nextOccurrence)) {
      const success = await run();
      scheduleNextOccurrence(success);
    }
  }

  // Initialise the timer
  intervalId = setInterval(checkAndRun, interval.total("milliseconds"));

  logger.info(
    `Scheduler created. Next occurrence: ${nextOccurrence.toString()}`,
  );

  return {
    run,
    abort,
    get isRunning() {
      return isRunning;
    },
    get durationUntilNext() {
      return now().until(nextOccurrence);
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
