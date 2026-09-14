"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface TimelineVirtualScrollValue {
  scrollToUnitId: (unitId: string) => void;
  scrollToDate: (date: string) => void;
}

const noop = () => {};

const TimelineVirtualScrollContext = createContext<TimelineVirtualScrollValue>({
  scrollToUnitId: noop,
  scrollToDate: noop,
});

export function TimelineVirtualScrollProvider({
  children,
  scrollToUnitId,
  scrollToDate,
}: TimelineVirtualScrollValue & { children: ReactNode }) {
  return (
    <TimelineVirtualScrollContext.Provider value={{ scrollToUnitId, scrollToDate }}>
      {children}
    </TimelineVirtualScrollContext.Provider>
  );
}

export function useTimelineVirtualScroll() {
  return useContext(TimelineVirtualScrollContext);
}
