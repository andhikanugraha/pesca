export type Scheduler = {
  start: () => void;
  run: (customCallback?: ({ signal }: { signal: AbortSignal }) => Promise<boolean>) => Promise<boolean>;
  abort: () => void;
  get isRunning(): boolean;
  get durationUntilNext(): Temporal.Duration;
  get nextOccurrence(): Temporal.ZonedDateTime | undefined;
  get lastSuccessfulOccurrence(): Temporal.ZonedDateTime | null;
  get lastFailedOccurrence(): Temporal.ZonedDateTime | null;
};

export function createScheduler(
  callback: ({ signal }: { signal: AbortSignal }) => Promise<boolean>,
  {
    initialOccurrence = Temporal.Now.zonedDateTimeISO(
      Temporal.Now.timeZoneId(),
    ),
    frequency = Temporal.Duration.from("P1D"),
    retryFrequency = Temporal.Duration.from("PT1H"),
    timeZone = Temporal.Now.timeZoneId(),
  }: {
    initialOccurrence?: Temporal.ZonedDateTime;
    frequency?: Temporal.Duration;
    retryFrequency?: Temporal.Duration;
    timeZone?: string;
  } = {},
): Scheduler {
  let nextOccurrence: Temporal.ZonedDateTime;
  let intervalId: number | null = null;

  let lastSuccessfulOccurrence: Temporal.ZonedDateTime | null = null;
  let lastFailedOccurrence: Temporal.ZonedDateTime | null = null;

  let isRunning: boolean = false;

  let abortController: AbortController;

  async function run(
    customCallback?: ({ signal }: { signal: AbortSignal }) => Promise<boolean>,
  ) {
    const now = Temporal.Now.zonedDateTimeISO();

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
      nextOccurrence = now.add(retryFrequency);
    }

    return success;
  }

  function scheduleNextOccurrence() {
    const now = Temporal.Now.zonedDateTimeISO();

    if (typeof nextOccurrence === "undefined") {
      nextOccurrence = initialOccurrence.toInstant().toZonedDateTimeISO(
        timeZone,
      );
      if (nextOccurrence.until(now).total("seconds") < 0) {
        nextOccurrence = now.add(frequency);
      }
    } else {
      run();
    }
  }

  async function checkAndRun() {
    const now = Temporal.Now.zonedDateTimeISO();

    if (now.until(nextOccurrence).total("seconds") <= 0) {
      await scheduleNextOccurrence();
    }
  }

  function start() {
    scheduleNextOccurrence();
    if (!intervalId) {
      intervalId = setInterval(checkAndRun, 60 * 1000); // 1 minute
    }
  }

  function abort() {
    if (abortController) {
      abortController.abort();
      lastSuccessfulOccurrence = Temporal.Now.zonedDateTimeISO();
    }
  }

  return {
    start,
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
