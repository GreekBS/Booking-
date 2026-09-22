import type {
  BookingComAriPushRequest,
  BookingComAriPushResult,
  IBookingComAriClient,
} from "../../../../src/channels";
import {
  parseBookingComAriPushResponse,
  buildBookingComAriAvailabilityXml,
} from "../../../../src/channels";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BookingComRuid } from "../../../../src/channels";

const FIXTURES = join(__dirname, "..", "fixtures");

/**
 * In-memory Booking.com ARI client for CM-4c-3 — no network.
 */
export class FakeBookingComAriClient implements IBookingComAriClient {
  readonly pushed: BookingComAriPushRequest[] = [];
  nextHttpStatus = 200;
  nextBody: string | null = null;
  failTransportOnce = false;
  throwOnPush: Error | null = null;

  seedPartialErrorBody(): void {
    this.nextBody = readFileSync(
      join(FIXTURES, "ari-partial-error-response.xml"),
      "utf8",
    );
    this.nextHttpStatus = 200;
  }

  async pushAvailabilityRatesRestrictions(
    request: BookingComAriPushRequest,
  ): Promise<BookingComAriPushResult> {
    if (this.throwOnPush) {
      const err = this.throwOnPush;
      this.throwOnPush = null;
      throw err;
    }
    if (this.failTransportOnce) {
      this.failTransportOnce = false;
      throw new Error("simulated network failure");
    }
    this.pushed.push(request);
    // Ensure XML builder is exercised against fixture shape.
    void buildBookingComAriAvailabilityXml(request);

    if (this.nextBody != null) {
      const parsed = parseBookingComAriPushResponse({
        httpStatus: this.nextHttpStatus,
        body: this.nextBody,
      });
      this.nextBody = null;
      this.nextHttpStatus = 200;
      return parsed;
    }

    if (this.nextHttpStatus !== 200) {
      const status = this.nextHttpStatus;
      this.nextHttpStatus = 200;
      return parseBookingComAriPushResponse({
        httpStatus: status,
        body: `<!-- RUID: [fake-ruid-http-${status}] -->`,
      });
    }

    return {
      success: true,
      httpStatus: 200,
      ruid: BookingComRuid("fake-ruid-ari-ok"),
      errors: [],
      warnings: [],
    };
  }
}
