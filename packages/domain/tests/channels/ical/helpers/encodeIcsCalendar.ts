export interface IcsTestEvent {
  readonly uid?: string;
  readonly dtstart: string;
  readonly dtend: string;
  readonly sequence?: number;
  readonly recurrenceId?: string;
}

export function encodeIcsCalendar(events: readonly IcsTestEvent[]): Uint8Array {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    if (event.uid !== undefined) {
      lines.push(`UID:${event.uid}`);
    }
    lines.push(`DTSTART;VALUE=DATE:${event.dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${event.dtend}`);
    if (event.sequence !== undefined) {
      lines.push(`SEQUENCE:${event.sequence}`);
    }
    if (event.recurrenceId !== undefined) {
      lines.push(`RECURRENCE-ID;VALUE=DATE:${event.recurrenceId}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new TextEncoder().encode(lines.join("\r\n"));
}
