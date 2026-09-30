"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useActiveProperty } from "@/hooks/use-active-property";
import { elCommon, elNav } from "@/lib/i18n";
import { adminNavItems } from "./admin-sidebar";
import { useBreadcrumbEntityLabelsContext } from "./breadcrumb-entity-labels";

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATIC_SEGMENT_LABELS: Record<string, string> = {
  assistant: elCommon.aiAssistant,
  onboarding: "Έναρξη",
  new: elCommon.new,
};

function isUuidSegment(segment: string): boolean {
  return UUID_SEGMENT.test(segment);
}

function labelForSegment(
  segment: string,
  path: string,
  previousSegment: string | undefined,
  entityLabels: Record<string, string>,
  propertyNameById: Map<string, string>,
): string {
  if (entityLabels[segment]) return entityLabels[segment];

  const nav = adminNavItems.find((item) => item.href === path);
  if (nav) return nav.label;

  if (STATIC_SEGMENT_LABELS[segment]) return STATIC_SEGMENT_LABELS[segment];

  if (isUuidSegment(segment)) {
    const propertyName = propertyNameById.get(segment);
    if (propertyName) return propertyName;
    if (previousSegment === "properties") return elCommon.property;
    if (previousSegment === "guests") return elCommon.guest;
    return elCommon.details;
  }

  return segment.replace(/-/g, " ");
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const { labels: entityLabels } = useBreadcrumbEntityLabelsContext();
  const { properties } = useActiveProperty();
  const propertyNameById = new Map(properties.map((p) => [p.id, p.name]));

  if (segments.length <= 1) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{elNav.dashboard}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const crumbs: Array<{ href: string; label: string; isLast: boolean }> = [];
  let current = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    current += `/${segment}`;
    crumbs.push({
      href: current,
      label: labelForSegment(
        segment,
        current,
        segments[i - 1],
        entityLabels,
        propertyNameById,
      ),
      isLast: i === segments.length - 1,
    });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
