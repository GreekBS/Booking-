import { statusLabelEl } from "@/lib/i18n";

export function buildBookingTimeline(status: string) {
  if (status === "cancelled") {
    return [
      { label: "Δημιουργήθηκε", active: true, current: false },
      { label: statusLabelEl("cancelled"), active: true, current: true },
    ];
  }
  const order = ["pending", "payment_pending", "confirmed", "completed"];
  const idx = order.indexOf(status);
  if (idx === -1) {
    return [{ label: statusLabelEl(status), active: true, current: true }];
  }
  return order.slice(0, idx + 1).map((step, i) => ({
    label: statusLabelEl(step),
    active: true,
    current: i === idx,
  }));
}
