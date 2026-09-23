import { BOOKING_COM_SCREENSHOT_MANIFEST } from "./help-content";

export function ScreenshotSlot({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const slot = BOOKING_COM_SCREENSHOT_MANIFEST.find((s) => s.id === id);
  if (!slot) return null;

  return (
    <figure
      className={
        className ??
        "overflow-hidden rounded-lg border border-dashed border-border bg-muted/30"
      }
    >
      {slot.imageSrc ? (
        // Real assets are added later; keep a plain img until next/image policy is decided.
        <img src={slot.imageSrc} alt={slot.altText} className="h-auto w-full" />
      ) : (
        <div
          role="img"
          aria-label={slot.altText}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-4 py-8 text-center"
        >
          <p className="text-sm font-medium text-foreground">{slot.caption}</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Booking.com screenshot will be added after test Extranet access.
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">{slot.id}</p>
        </div>
      )}
      <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
        {slot.caption}
        {slot.annotation ? ` — ${slot.annotation}` : ""}
      </figcaption>
    </figure>
  );
}
