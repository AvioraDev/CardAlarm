// Pure pagination helpers for customer lists (For You, Saved).
// No framework imports: engine/__tests__/pagination.test.ts imports this file directly.

export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 96;
export const MAX_PAGE = 10_000;

const PAGE_PATTERN = /^[1-9]\d{0,4}$/;

/** Reads `?page=` (first value if repeated). Anything that is not a plain positive integer becomes 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !PAGE_PATTERN.test(value)) return 1;
  return Math.min(Number.parseInt(value, 10), MAX_PAGE);
}

/** undefined/NaN -> default; otherwise truncated and clamped to [1, MAX_PAGE_SIZE]. */
export function clampPageSize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(size), 1), MAX_PAGE_SIZE);
}

export function pageOffset(page: number, pageSize: number): number {
  return Math.max((page - 1) * pageSize, 0);
}

export interface PageWindow {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  start: number;
  end: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function pageWindow(total: number, page: number, pageSize: number): PageWindow {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return {
    page,
    pageSize,
    total,
    pageCount,
    start,
    end,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

/** Builds a link that keeps the current filters, drops empty values and only adds `page` when > 1. */
export function pageHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined || value === "") continue;
    search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
