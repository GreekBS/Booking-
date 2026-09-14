import type { ITimezoneService } from "@hcp/domain";

export class TimezoneService implements ITimezoneService {
  async propertyLocalToday(timezone: string, at: Date = new Date()): Promise<string> {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
      throw new Error(`Unable to resolve local date for timezone ${timezone}`);
    }

    return `${year}-${month}-${day}`;
  }
}
