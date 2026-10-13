import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Disable both controls while a page fetch is in flight. */
  disabled?: boolean;
  /** Optional Greek (or localized) labels; defaults to Greek for operator UI. */
  previousLabel?: string;
  nextLabel?: string;
  pageLabel?: (page: number, totalPages: number) => string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  previousLabel = "Προηγούμενη",
  nextLabel = "Επόμενη",
  pageLabel = (p, t) => `Σελίδα ${p} από ${t}`,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted-foreground">{pageLabel(page, totalPages)}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {previousLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
