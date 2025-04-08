import { ScheduleParams } from "../config.ts";

interface ParsedScheduleParams {
  daily: Temporal.PlainTime;
  retry: Temporal.Duration;
  interval: Temporal.Duration;
  tz: string;
}

export function parseParams(params: ScheduleParams): ParsedScheduleParams {
  return {
    daily: Temporal.PlainTime.from(
      params.daily || Temporal.Now.plainTimeISO().toString(),
    ),
    retry: Temporal.Duration.from(params.retry || "PT30M"),
    interval: Temporal.Duration.from(params.interval || "PT5M"),
    tz: params.tz || Temporal.Now.timeZoneId(),
  };
}

export function now(tz?: string) {
  return Temporal.Now.zonedDateTimeISO(tz);
}

export function isPast(zonedDateTime: Temporal.ZonedDateTime) {
  return Temporal.ZonedDateTime.compare(now(), zonedDateTime) >= 0;
}

export function* generateSchedule(
  { daily, tz }: { daily: Temporal.PlainTime; tz?: string },
) {
  let nextOccurrence = now(tz).withPlainTime(daily);

  do {
    while (isPast(nextOccurrence)) {
      nextOccurrence = nextOccurrence.add({ days: 1 });
    }

    yield nextOccurrence;
  } while (true);
}
