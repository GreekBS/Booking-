import { IcalParseError, wrapIcalParseBoundaryError } from "./icalParseErrors";
import { ICAL_PARSE_LIMITS } from "./icalParseLimits";
import type { IcalParseIssueCode } from "./icalParseIssueCodes";
import type {
  NormalizedIcalCalendar,
  NormalizedIcalComponent,
  NormalizedIcalEvent,
  NormalizedGenericIcalComponent,
  NormalizedIcalIssue,
  NormalizedIcalProperty,
} from "./icalParseTypes";
import { parseBeginOrEndLine, parseIcalContentLine } from "./parseIcalContentLine";
import { promoteCalendarFields, promoteEventFields } from "./promoteIcalFields";
import { scanIcalPhysicalLines } from "./scanIcalPhysicalLines";
import { unfoldIcalLogicalLines } from "./unfoldIcalLines";

interface MutableComponent {
  name: string;
  componentIndex: number;
  properties: NormalizedIcalProperty[];
  components: MutableComponent[];
  issues: NormalizedIcalIssue[];
  /** Set for root VEVENT after promotion. */
  eventIndex?: number;
  promotions?: ReturnType<typeof promoteEventFields>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const child = (value as Record<string | symbol, unknown>)[key];
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function pushPlacementIssue(component: MutableComponent, code: IcalParseIssueCode): void {
  component.issues.push({
    code,
    componentName: component.name,
    componentIndex: component.componentIndex,
  });
}

function isNormalizedIcalEvent(
  component: NormalizedIcalComponent,
): component is NormalizedIcalEvent {
  return component.name === "VEVENT";
}

function finalizeComponent(node: MutableComponent): NormalizedIcalComponent {
  if (node.name === "VEVENT") {
    const promotions = node.promotions!;
    const event: NormalizedIcalEvent = {
      name: "VEVENT",
      componentIndex: node.componentIndex,
      eventIndex: node.eventIndex!,
      properties: node.properties,
      components: node.components.map(finalizeComponent),
      issues: [...node.issues, ...promotions.issues],
      uid: promotions.uid,
      sequence: promotions.sequence,
      status: promotions.status,
      summary: promotions.summary,
      description: promotions.description,
      location: promotions.location,
      dtstart: promotions.dtstart,
      dtend: promotions.dtend,
      recurrenceId: promotions.recurrenceId,
      dtstamp: promotions.dtstamp,
      created: promotions.created,
      lastModified: promotions.lastModified,
    };
    return event;
  }

  const generic: NormalizedGenericIcalComponent = {
    name: node.name,
    componentIndex: node.componentIndex,
    properties: node.properties,
    components: node.components.map(finalizeComponent),
    issues: node.issues,
  };
  return generic;
}

function parseIcalCalendarInner(rawBytes: Uint8Array): NormalizedIcalCalendar {
  const physical = scanIcalPhysicalLines(rawBytes);
  const logical = unfoldIcalLogicalLines(rawBytes, physical);

  let totalProperties = 0;
  let totalComponents = 0;

  const root: MutableComponent = {
    name: "VCALENDAR",
    componentIndex: 0,
    properties: [],
    components: [],
    issues: [],
  };

  type Frame = { node: MutableComponent; depth: number };
  const stack: Frame[] = [];
  let rootClosed = false;

  const openComponent = (name: string, lineNumber: number): void => {
    if (stack.length === 0) {
      throw new IcalParseError("ICAL_PARSE_INTERNAL_ERROR", "Internal calendar parse failure", {
        lineNumber,
      });
    }
    const parent = stack[stack.length - 1]!.node;
    const depth = stack.length; // depth of new component (root VCALENDAR is depth 1 on stack)

    if (depth + 1 > ICAL_PARSE_LIMITS.maxNestingDepth) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Component nesting depth exceeds limit",
        { lineNumber, limitKey: "maxNestingDepth" },
      );
    }
    if (totalComponents >= ICAL_PARSE_LIMITS.maxTotalComponents) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Component count exceeds limit",
        { lineNumber, limitKey: "maxTotalComponents" },
      );
    }

    // Placement rules
    if (name === "VCALENDAR") {
      throw new IcalParseError(
        "ICAL_PARSE_NESTED_VCALENDAR",
        "Nested VCALENDAR is not allowed",
        { lineNumber },
      );
    }
    if (name === "VEVENT") {
      if (parent.name === "VEVENT") {
        throw new IcalParseError(
          "ICAL_PARSE_NESTED_VEVENT",
          "Nested VEVENT is not allowed",
          { lineNumber },
        );
      }
      if (parent.name !== "VCALENDAR" || stack.length !== 1) {
        throw new IcalParseError(
          "ICAL_PARSE_VEVENT_NOT_ROOT_CHILD",
          "VEVENT must be a direct child of VCALENDAR",
          { lineNumber },
        );
      }
    }
    if (parent.name === "VEVENT" && name === "VEVENT") {
      throw new IcalParseError(
        "ICAL_PARSE_NESTED_VEVENT",
        "Nested VEVENT is not allowed",
        { lineNumber },
      );
    }
    if (parent.name === "VALARM") {
      throw new IcalParseError(
        "ICAL_PARSE_VALARM_NESTED",
        "VALARM must not contain child components",
        { lineNumber },
      );
    }

    totalComponents += 1;
    const child: MutableComponent = {
      name,
      componentIndex: parent.components.length,
      properties: [],
      components: [],
      issues: [],
    };

    // Soft placement issues
    if (name === "VALARM" && parent.name !== "VEVENT") {
      pushPlacementIssue(child, "UNEXPECTED_COMPONENT_PLACEMENT");
    }
    if (
      (name === "STANDARD" || name === "DAYLIGHT") &&
      parent.name !== "VTIMEZONE"
    ) {
      pushPlacementIssue(child, "UNEXPECTED_COMPONENT_PLACEMENT");
    }
    if (
      parent.name === "VTIMEZONE" &&
      name !== "STANDARD" &&
      name !== "DAYLIGHT"
    ) {
      pushPlacementIssue(child, "UNEXPECTED_COMPONENT_PLACEMENT");
    }

    parent.components.push(child);
    stack.push({ node: child, depth: depth + 1 });
  };

  for (const line of logical) {
    if (rootClosed) {
      throw new IcalParseError(
        "ICAL_PARSE_TRAILING_CONTENT",
        "Content after END:VCALENDAR is not allowed",
        { lineNumber: line.lineNumber },
      );
    }

    const beginEnd = parseBeginOrEndLine(line.text, line.lineNumber);
    if (beginEnd) {
      if (beginEnd.kind === "BEGIN") {
        if (stack.length === 0) {
          if (beginEnd.componentName !== "VCALENDAR") {
            throw new IcalParseError(
              "ICAL_PARSE_MISSING_VCALENDAR",
              "First component must be VCALENDAR",
              { lineNumber: line.lineNumber },
            );
          }
          if (line.lineNumber !== 1) {
            throw new IcalParseError(
              "ICAL_PARSE_MISSING_VCALENDAR",
              "First logical line must be BEGIN:VCALENDAR",
              { lineNumber: line.lineNumber },
            );
          }
          totalComponents += 1;
          stack.push({ node: root, depth: 1 });
          continue;
        }
        openComponent(beginEnd.componentName, line.lineNumber);
        continue;
      }

      // END
      if (stack.length === 0) {
        throw new IcalParseError(
          "ICAL_PARSE_UNBALANCED_COMPONENT",
          "END without matching BEGIN",
          { lineNumber: line.lineNumber },
        );
      }
      const current = stack[stack.length - 1]!;
      if (current.node.name !== beginEnd.componentName) {
        throw new IcalParseError(
          "ICAL_PARSE_UNBALANCED_COMPONENT",
          "BEGIN/END component names do not match",
          { lineNumber: line.lineNumber },
        );
      }
      stack.pop();
      if (current.node.name === "VCALENDAR") {
        rootClosed = true;
      }
      continue;
    }

    // Ordinary property
    if (stack.length === 0) {
      throw new IcalParseError(
        "ICAL_PARSE_MISSING_VCALENDAR",
        "First logical line must be BEGIN:VCALENDAR",
        { lineNumber: line.lineNumber },
      );
    }
    if (totalProperties >= ICAL_PARSE_LIMITS.maxTotalProperties) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Property count exceeds limit",
        { lineNumber: line.lineNumber, limitKey: "maxTotalProperties" },
      );
    }
    const parsed = parseIcalContentLine(line.text, line.lineNumber);
    const owner = stack[stack.length - 1]!.node;
    const property: NormalizedIcalProperty = {
      name: parsed.name,
      parameters: parsed.parameters,
      value: parsed.value,
      propertyIndex: owner.properties.length,
    };
    owner.properties.push(property);
    totalProperties += 1;
  }

  if (stack.length !== 0 || !rootClosed) {
    throw new IcalParseError(
      "ICAL_PARSE_UNBALANCED_COMPONENT",
      "Unbalanced calendar components",
    );
  }

  // Count root VEVENTs and promote
  let veventCount = 0;
  const events: NormalizedIcalEvent[] = [];
  for (const child of root.components) {
    if (child.name === "VEVENT") {
      if (veventCount >= ICAL_PARSE_LIMITS.maxRootVeventCount) {
        throw new IcalParseError(
          "ICAL_PARSE_LIMIT_EXCEEDED",
          "VEVENT count exceeds limit",
          { limitKey: "maxRootVeventCount" },
        );
      }
      child.eventIndex = veventCount;
      child.promotions = promoteEventFields(child.properties, {
        componentIndex: child.componentIndex,
        eventIndex: veventCount,
      });
      veventCount += 1;
    }
  }

  const calendarPromotions = promoteCalendarFields(root.properties);
  const finalizedComponents = root.components.map(finalizeComponent);

  for (const component of finalizedComponents) {
    if (isNormalizedIcalEvent(component)) {
      events.push(component);
    }
  }

  // Identity: events must be same references as in components
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!;
    const fromComponents = finalizedComponents[event.componentIndex];
    if (fromComponents !== event) {
      throw new IcalParseError(
        "ICAL_PARSE_INTERNAL_ERROR",
        "Internal calendar parse failure",
      );
    }
  }

  const calendar: NormalizedIcalCalendar = {
    rawByteLength: rawBytes.byteLength,
    prodid: calendarPromotions.prodid,
    version: calendarPromotions.version,
    calscale: calendarPromotions.calscale,
    method: calendarPromotions.method,
    properties: root.properties,
    components: finalizedComponents,
    events,
    issues: [...root.issues, ...calendarPromotions.issues],
  };

  return deepFreeze(calendar);
}

/**
 * Provider-1 P1-S3 — parse raw ICS bytes into a normalized calendar DTO.
 * Document-fatal failures throw IcalParseError. Soft issues are on the result.
 */
export function parseIcalCalendar(rawBytes: Uint8Array): NormalizedIcalCalendar {
  try {
    return parseIcalCalendarInner(rawBytes);
  } catch (error) {
    wrapIcalParseBoundaryError(error);
  }
}
