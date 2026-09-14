export function buildBookingTimeline(status: string) {
  if (status === "cancelled") {
    return [
      { label: "Created", active: true, current: false },
      { label: "Cancelled", active: true, current: true },
    ];
  }
  const order = ["pending", "payment_pending", "confirmed", "completed"];
  const idx = order.indexOf(status);
  if (idx === -1) {
    return [{ label: status.replace(/_/g, " "), active: true, current: true }];
  }
  return order.slice(0, idx + 1).map((step, i) => ({
    label: step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    active: true,
    current: i === idx,
  }));
}
