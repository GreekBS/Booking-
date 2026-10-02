export type WorkspaceMode = "idle" | "date-edit" | "booking" | "hold" | "block";

export interface WorkspaceBookingTarget {
  id: string;
  unitId: string;
  unitName: string;
  propertyName: string;
}

export interface WorkspaceHoldTarget {
  id: string;
  unitId: string;
  unitName: string;
  propertyName: string;
}

export interface WorkspaceBlockTarget {
  id: string;
  unitId: string;
  unitName: string;
  propertyName: string;
  blockType: string;
  checkIn: string;
  checkOut: string;
  reason: string | null;
}

export interface WorkspacePayload {
  selection?: TimelineSelection;
  booking?: WorkspaceBookingTarget;
  hold?: WorkspaceHoldTarget;
  block?: WorkspaceBlockTarget;
}

export interface WorkspaceState {
  open: boolean;
  mode: WorkspaceMode;
  payload: WorkspacePayload | null;
}

export interface TimelineSelection {
  unitId: string;
  from: string;
  to: string;
  openMinStay?: boolean;
}

/** How CalendarKeyboardBindings should scroll after a focus change. */
export type FocusScrollMode = "none" | "nearest" | "center";

export interface TimelineFocus {
  unitId: string;
  date: string;
  /**
   * Pointer/mouse focus omits this (or uses "none") so clicking a visible cell
   * does not auto-center the month-grid scroller and steal the click.
   * Keyboard navigation uses "nearest"; explicit Today uses "center".
   */
  scroll?: FocusScrollMode;
}

export interface RackUnit {
  unitId: string;
  unitName: string;
  propertyId: string;
  propertyName: string;
}

export interface RackPropertyGroup {
  propertyId: string;
  propertyName: string;
  /** Units visible in the rack (may be search-filtered). */
  units: RackUnit[];
  /** All unit ids in the property catalog (for summaries and data scope). */
  catalogUnitIds: string[];
}
