import type { Entry } from "./content";

export const PAGE_SIZE = 12;

export type ProjectCatalogFilters = {
  q: string;
  category: string;
  year: string;
  sort: "newest" | "oldest";
  page: number;
};

export type ProjectCatalog = {
  entries: Entry[];
  total: number;
  page: number;
  pageCount: number;
  totalPublished: number;
  categories: { name: string; count: number }[];
  years: { year: string; count: number }[];
};

function firstParameter(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function normalizeProjectFilters(
  params: Record<string, string | string[] | undefined>,
): ProjectCatalogFilters {
  const year = firstParameter(params.year);
  const pageValue = firstParameter(params.page);
  const page = /^\d+$/.test(pageValue) ? Number(pageValue) : 1;
  return {
    q: firstParameter(params.q).slice(0, 100),
    category: firstParameter(params.category).slice(0, 40),
    year: /^\d{4}$/.test(year) ? year : "",
    sort: firstParameter(params.sort) === "oldest" ? "oldest" : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function buildProjectCatalogHref(
  filters: ProjectCatalogFilters,
  overrides?: Partial<ProjectCatalogFilters>,
) {
  const values = { ...filters, ...overrides };
  const normalized = normalizeProjectFilters({
    ...values,
    page: String(values.page),
  });
  const params = new URLSearchParams();
  if (normalized.q) params.set("q", normalized.q);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.year) params.set("year", normalized.year);
  if (normalized.sort !== "newest") params.set("sort", normalized.sort);
  if (normalized.page !== 1) params.set("page", String(normalized.page));
  const query = params.toString();
  return query ? `/work?${query}` : "/work";
}
