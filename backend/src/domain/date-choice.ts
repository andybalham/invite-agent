import {
  isProposedDateInput,
  type ProposedDate,
  type ProposedDateInput
} from "@invite-a-gent/contracts";

export type DateChoiceResolutionCode =
  | "DATE_INVALID"
  | "DATE_TIME_NONEXISTENT"
  | "DATE_TIME_AMBIGUOUS"
  | "DATE_TIME_OFFSET_INVALID";

export interface DateChoiceResolutionIssue {
  readonly code: DateChoiceResolutionCode;
  readonly message: string;
  readonly validOffsets?: readonly string[];
}

export type DateChoiceResolution =
  | { readonly success: true; readonly data: ProposedDate }
  | { readonly success: false; readonly input: unknown; readonly issue: DateChoiceResolutionIssue };

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function parseLocalDateTime(value: string): LocalParts {
  const [date = "", time = ""] = value.split("T");
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return { year, month, day, hour, minute };
}

function localPartsAt(instant: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute")
  };
}

function sameLocal(left: LocalParts, right: LocalParts): boolean {
  return Object.keys(left).every(
    (key) => left[key as keyof LocalParts] === right[key as keyof LocalParts]
  );
}

function offsetMinutesAt(instant: number, timeZone: string): number {
  const local = localPartsAt(instant, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return Math.round((localAsUtc - instant) / 60_000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function possibleInstants(localDateTime: string, timeZone: string): Array<{
  instant: number;
  offset: string;
}> {
  const local = parseLocalDateTime(localDateTime);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const possibleOffsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    possibleOffsets.add(offsetMinutesAt(localAsUtc + hours * 3_600_000, timeZone));
  }
  return [...possibleOffsets]
    .map((minutes) => ({
      instant: localAsUtc - minutes * 60_000,
      offset: formatOffset(minutes)
    }))
    .filter(({ instant }) => sameLocal(localPartsAt(instant, timeZone), local))
    .sort((left, right) => left.instant - right.instant);
}

export function resolveProposedDate(input: unknown, timeZone: string): DateChoiceResolution {
  if (!isProposedDateInput(input)) {
    return {
      success: false,
      input,
      issue: { code: "DATE_INVALID", message: "Enter a valid date or date and time" }
    };
  }
  if (input.kind === "date") {
    return { success: true, data: input };
  }

  const possible = possibleInstants(input.localDateTime, timeZone);
  if (possible.length === 0) {
    return {
      success: false,
      input,
      issue: {
        code: "DATE_TIME_NONEXISTENT",
        message: "That local time does not exist in the selected time zone"
      }
    };
  }
  if (possible.length > 1 && input.utcOffset === undefined) {
    return {
      success: false,
      input,
      issue: {
        code: "DATE_TIME_AMBIGUOUS",
        message: "That local time happens twice; choose a UTC offset",
        validOffsets: possible.map(({ offset }) => offset)
      }
    };
  }
  const selected =
    input.utcOffset === undefined
      ? possible[0]
      : possible.find(({ offset }) => offset === input.utcOffset);
  if (!selected) {
    return {
      success: false,
      input,
      issue: {
        code: "DATE_TIME_OFFSET_INVALID",
        message: "Choose a valid UTC offset for that local time",
        validOffsets: possible.map(({ offset }) => offset)
      }
    };
  }
  return {
    success: true,
    data: {
      kind: "date-time",
      localDateTime: input.localDateTime,
      utcInstant: new Date(selected.instant).toISOString(),
      timeZone,
      utcOffset: selected.offset
    }
  };
}

export function proposedDateKey(choice: ProposedDate | ProposedDateInput): string {
  if (choice.kind === "date") return `date:${choice.localDate}`;
  if ("utcInstant" in choice) return `date-time:${choice.utcInstant}`;
  return `date-time:${choice.localDateTime}:${choice.utcOffset ?? ""}`;
}
