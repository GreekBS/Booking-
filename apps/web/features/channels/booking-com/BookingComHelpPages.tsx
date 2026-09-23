"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_COM_HELP_SECTIONS } from "./help-content";
import { ScreenshotSlot } from "./ScreenshotSlot";

export function ChannelsHelpIndexPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Channel Help Center"
        description="Guides for connecting distribution channels to Talos."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels">Back to channels</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking.com</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              How to connect Booking.com to Talos — mapping, first sync, health, and FAQ.
            </p>
            <Button asChild>
              <Link href="/dashboard/channels/help/booking-com">Open guide</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="opacity-80">
          <CardHeader>
            <CardTitle className="text-base">iCal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              iCal help will reuse this Help Center structure. Use the connection detail screen
              for the current pilot flow.
            </p>
          </CardContent>
        </Card>
        <Card className="opacity-80">
          <CardHeader>
            <CardTitle className="text-base">Airbnb</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Guide placeholder — integration not available yet.</p>
          </CardContent>
        </Card>
        <Card className="opacity-80">
          <CardHeader>
            <CardTitle className="text-base">Expedia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Guide placeholder — integration not available yet.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function BookingComHelpPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="How to connect Booking.com to Talos"
        description="Operator guide for setup, mapping, synchronization, and health."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels/help">Help Center</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/channels/booking-com/setup">Start setup</Link>
            </Button>
          </div>
        }
      />

      {BOOKING_COM_HELP_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
          {section.screenshotIds?.map((id) => (
            <ScreenshotSlot key={id} id={id} />
          ))}
        </section>
      ))}
    </article>
  );
}
