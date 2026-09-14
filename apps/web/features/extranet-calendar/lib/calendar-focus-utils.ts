export function blurActiveCalendarCell(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest("[data-calendar-cell]")) {
    active.blur();
  }
}
