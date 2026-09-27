"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { BOOKING_COM_HELP_SECTIONS } from "./help-content";
import { ScreenshotSlot } from "./ScreenshotSlot";

export function ChannelsHelpIndexPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Βοήθεια καναλιών"
        description="Οδηγοί σύνδεσης καναλιών διανομής στο Talos."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels">Πίσω στα κανάλια</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Surface>
          <SurfaceHeader title="Booking.com" />
          <p className="text-sm text-muted-foreground">
            Σύνδεση Booking.com — αντιστοιχίσεις, πρώτο sync, υγεία και FAQ.
          </p>
          <div className="mt-3">
            <Button asChild>
              <Link href="/dashboard/channels/help/booking-com">Άνοιγμα οδηγού</Link>
            </Button>
          </div>
        </Surface>
        <Surface className="opacity-80">
          <SurfaceHeader title="iCal" />
          <p className="text-sm text-muted-foreground">
            Χρησιμοποιήστε την οθόνη λεπτομερειών σύνδεσης για την τρέχουσα ροή iCal pilot.
          </p>
        </Surface>
        <Surface className="opacity-80">
          <SurfaceHeader title="Airbnb" />
          <p className="text-sm text-muted-foreground">
            Placeholder οδηγού — η ενσωμάτωση δεν είναι διαθέσιμη ακόμα.
          </p>
        </Surface>
        <Surface className="opacity-80">
          <SurfaceHeader title="Expedia" />
          <p className="text-sm text-muted-foreground">
            Placeholder οδηγού — η ενσωμάτωση δεν είναι διαθέσιμη ακόμα.
          </p>
        </Surface>
      </div>
    </div>
  );
}

export function BookingComHelpPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Σύνδεση Booking.com με το Talos"
        description="Οδηγός χειριστή για ρύθμιση, αντιστοιχίσεις, συγχρονισμό και υγεία."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels/help">Βοήθεια</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/channels/booking-com/setup">Έναρξη ρύθμισης</Link>
            </Button>
          </div>
        }
      />

      {BOOKING_COM_HELP_SECTIONS.map((section) => (
        <Surface key={section.id} id={section.id} className="scroll-mt-24">
          <SurfaceHeader title={section.title} />
          <div className="space-y-3">
            {section.body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
            {section.screenshotIds?.map((id) => (
              <ScreenshotSlot key={id} id={id} />
            ))}
          </div>
        </Surface>
      ))}
    </article>
  );
}
