import Link from "next/link";
import { pageHref, type PageWindow } from "@/lib/pagination";

interface PaginationNavProps {
  window: PageWindow;
  basePath: string;
  params: Record<string, string | undefined>;
  /** Plural noun for the summary line, e.g. "cards" or "saved cards". */
  noun: string;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-NZ");
}

export function PaginationNav({ window: pager, basePath, params, noun }: PaginationNavProps) {
  if (pager.total === 0) return null;

  return (
    <nav aria-label="Pagination" className="mt-2 flex flex-col items-center gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
      <p className="text-[0.875rem] text-text-muted">
        Showing{" "}
        <span className="data text-text">
          {formatCount(pager.start)}–{formatCount(pager.end)}
        </span>{" "}
        of <span className="data text-text">{formatCount(pager.total)}</span> {noun}
      </p>
      {pager.pageCount > 1 ? (
        <div className="flex items-center gap-2">
          {pager.hasPrevious ? (
            <Link href={pageHref(basePath, params, pager.page - 1)} rel="prev" className="btn btn-secondary btn-sm">
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className="btn btn-secondary btn-sm">
              Previous
            </span>
          )}
          <span className="data text-[0.8125rem] text-text-muted">
            Page {formatCount(pager.page)} of {formatCount(pager.pageCount)}
          </span>
          {pager.hasNext ? (
            <Link href={pageHref(basePath, params, pager.page + 1)} rel="next" className="btn btn-secondary btn-sm">
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className="btn btn-secondary btn-sm">
              Next
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
