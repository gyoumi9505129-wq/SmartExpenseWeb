"use client";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  if (total === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
      <p>
        {from}–{to} / 총 {total.toLocaleString("ko-KR")}건
        {totalPages > 1 ? ` · ${safePage}/${totalPages}페이지` : null}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 disabled:opacity-40"
          >
            처음
          </button>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 disabled:opacity-40"
          >
            이전
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 disabled:opacity-40"
          >
            다음
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 disabled:opacity-40"
          >
            마지막
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const PAGE_SIZE = 20;

export function paginateSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
