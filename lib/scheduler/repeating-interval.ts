function timesDuration(
  duration: Temporal.Duration,
  factor: number,
): Temporal.Duration {
  return new Temporal.Duration(
    duration.years * factor,
    duration.months * factor,
    duration.weeks * factor,
    duration.days * factor,
    duration.hours * factor,
    duration.minutes * factor,
    duration.seconds * factor,
    duration.milliseconds * factor,
    duration.microseconds * factor,
    duration.nanoseconds * factor,
  );
}

function parseDateTime(info: string): Temporal.ZonedDateTime {
  try {
    return Temporal.ZonedDateTime.from(info);
  } catch (_e) {
    const plainDate = Temporal.PlainDateTime.from(info);
    return plainDate.toZonedDateTime(Temporal.Now.timeZoneId());
  }
}

export default class RepeatingInterval {
  repeatCount: number;
  start?: Temporal.ZonedDateTime;
  end?: Temporal.ZonedDateTime;
  duration?: Temporal.Duration;

  #initDateTime: Temporal.ZonedDateTime = Temporal.Now.zonedDateTimeISO();

  constructor(
    repeatCount: number,
    start?: Temporal.ZonedDateTime,
    end?: Temporal.ZonedDateTime,
    duration?: Temporal.Duration,
  ) {
    this.repeatCount = repeatCount;
    this.start = start;
    this.end = end;
    this.duration = duration;
  }

  static from(iso8601String: string): RepeatingInterval {
    if (!iso8601String.startsWith("R")) {
      throw new TypeError(
        "Input string must represent a repeating interval (start with 'R').",
      );
    }

    const [repeat, partA, partB] = iso8601String.split("/");

    let repeatCount: number = Infinity;
    if (repeat !== "R") {
      repeatCount = parseInt(repeat.substring(1));
    }

    let start: Temporal.ZonedDateTime | undefined;
    let end: Temporal.ZonedDateTime | undefined;
    let duration: Temporal.Duration | undefined;

    if (partA.startsWith("P")) {
      duration = Temporal.Duration.from(partA);
      if (partB) {
        end = parseDateTime(partB);
      }
    } else {
      start = parseDateTime(partA);
      if (partB.startsWith("P")) {
        duration = Temporal.Duration.from(partB);
      } else {
        end = parseDateTime(partB);
      }
    }

    return new RepeatingInterval(repeatCount, start, end, duration);
  }

  firstAfter(
    datetime: Temporal.ZonedDateTime | string,
  ): Temporal.ZonedDateTime | null {
    datetime = Temporal.ZonedDateTime.from(datetime); // Ensure input date is Temporal.ZonedDateTime
    if (this.end && Temporal.ZonedDateTime.compare(datetime, this.end) > 0) {
      return null;
    }
    if (
      this.start && Temporal.ZonedDateTime.compare(datetime, this.start) <= 0
    ) return this.start;

    let index = 0;
    const initialCursor = this.start || this.#initDateTime;
    let cursor = Temporal.ZonedDateTime.from(initialCursor);

    do {
      index++;
      cursor = initialCursor.add(
        timesDuration(this.duration as Temporal.Duration, index),
      );
    } while (Temporal.ZonedDateTime.compare(cursor, datetime) <= 0);

    return cursor;
  }
}
