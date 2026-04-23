import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Filter, Search, X } from "lucide-react";
import { Input } from "./ui/Input";
import { Empty } from "./ui/Empty";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  render?: (row: T) => React.ReactNode;
  filter?: (row: T) => string;
};

type SortState<T> = { key: keyof T & string; dir: "asc" | "desc" } | null;

export function DataGrid<T extends { id: string }>({
  rows,
  columns,
  selected,
  onSelectedChange,
  externalQuery = "",
  filters = [],
  empty = "No rows yet."
}: {
  rows: T[];
  columns: Column<T>[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  externalQuery?: string;
  filters?: { label: string; key: keyof T & string; value: string }[];
  empty?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<T>>(null);
  const [filterKey, setFilterKey] = useState<keyof T & string | "">("");
  const [filterValue, setFilterValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: T } | null>(null);
  const [dragBox, setDragBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const filterOptions = useMemo(() => {
    if (!filterKey) return [];
    const column = columns.find((item) => item.key === filterKey);
    const values = rows
      .map((row) => (column?.filter ? column.filter(row) : String(row[filterKey] ?? "")))
      .filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [columns, filterKey, rows]);

  const visible = useMemo(() => {
    const mergedQuery = [query, externalQuery].filter(Boolean).join(" ").toLowerCase().trim();
    const activeFilters = [...filters, ...(filterKey && filterValue ? [{ label: columns.find((column) => column.key === filterKey)?.label ?? filterKey, key: filterKey, value: filterValue }] : [])];
    const filtered = mergedQuery
      ? rows.filter((row) =>
          columns.some((column) => {
            const value = column.filter ? column.filter(row) : String(row[column.key] ?? "");
            return value.toLowerCase().includes(mergedQuery);
          })
        )
      : rows;
    const filteredByChips = activeFilters.reduce(
      (current, filter) => current.filter((row) => {
        const column = columns.find((item) => item.key === filter.key);
        const value = column?.filter ? column.filter(row) : String(row[filter.key] ?? "");
        return value.toLowerCase() === filter.value.toLowerCase();
      }),
      filtered
    );
    if (!sort) return filteredByChips;
    return [...filteredByChips].sort((a, b) => {
      const left = String(a[sort.key] ?? "");
      const right = String(b[sort.key] ?? "");
      return sort.dir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
  }, [columns, externalQuery, filterKey, filterValue, filters, query, rows, sort]);

  const activeFilterChips = [...filters, ...(filterKey && filterValue ? [{ label: columns.find((column) => column.key === filterKey)?.label ?? filterKey, key: filterKey, value: filterValue }] : [])];

  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);

  function cycleSort(key: keyof T & string) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function toggle(id: string) {
    onSelectedChange(selected.includes(id) ? selected.filter((rowId) => rowId !== id) : [...selected, id]);
  }

  function marqueeSelect(box: { x: number; y: number; w: number; h: number }) {
    const table = tableRef.current;
    if (!table) return;
    const tableRect = table.getBoundingClientRect();
    const marquee = {
      left: tableRect.left + box.x,
      top: tableRect.top + box.y,
      right: tableRect.left + box.x + box.w,
      bottom: tableRect.top + box.y + box.h
    };
    const ids: string[] = [];
    for (const row of table.querySelectorAll<HTMLElement>("[data-row-id]")) {
      const rect = row.getBoundingClientRect();
      const intersects = rect.left < marquee.right && rect.right > marquee.left && rect.top < marquee.bottom && rect.bottom > marquee.top;
      if (intersects) ids.push(row.dataset.rowId!);
    }
    onSelectedChange(Array.from(new Set(ids)));
  }

  return (
    <div className="data-grid">
      <div className="grid-toolbar">
        <div className="grid-search">
          <Search size={16} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rows" />
        </div>
        <span className="filter-indicator">
          <Filter size={15} />
          {query || externalQuery || filters.length ? `Filtered to ${visible.length}` : `${rows.length} rows`}
        </span>
        <span className="selection-pill">{selected.length} selected</span>
      </div>
      <div className="grid-filters">
        <select
          value={filterKey}
          onChange={(event) => {
            setFilterKey(event.target.value as keyof T & string);
            setFilterValue("");
          }}
          aria-label="Filter column"
        >
          <option value="">Filter by column</option>
          {columns.map((column) => (
            <option key={column.key} value={column.key}>{column.label}</option>
          ))}
        </select>
        <select value={filterValue} onChange={(event) => setFilterValue(event.target.value)} disabled={!filterKey} aria-label="Filter value">
          <option value="">Any value</option>
          {filterOptions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        {filterKey || filterValue || query || externalQuery || filters.length ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setFilterKey("");
              setFilterValue("");
              setQuery("");
            }}
          >
            Clear local filters
          </button>
        ) : null}
      </div>
      <div
        className="grid-table"
        ref={tableRef}
        onPointerDown={(event) => {
          setContextMenu(null);
          if ((event.target as HTMLElement).closest("button,input,a,select")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          setDragOrigin(origin);
          setDragBox({ ...origin, w: 0, h: 0 });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragOrigin) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const box = {
            x: Math.min(dragOrigin.x, x),
            y: Math.min(dragOrigin.y, y),
            w: Math.abs(x - dragOrigin.x),
            h: Math.abs(y - dragOrigin.y)
          };
          setDragBox(box);
          marqueeSelect(box);
        }}
        onPointerUp={(event) => {
          setDragOrigin(null);
          setDragBox(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        {dragBox ? <div className="marquee-box" style={{ left: dragBox.x, top: dragBox.y, width: dragBox.w, height: dragBox.h }} /> : null}
        {activeFilterChips.length ? (
          <div className="filter-chips">
            {activeFilterChips.map((filter) => (
              <span key={`${filter.key}-${filter.value}`} className="filter-chip">{filter.label}: {filter.value}</span>
            ))}
          </div>
        ) : null}
        {visible.length === 0 ? (
          <div className="grid-empty-wrap">
            <Empty title={empty} description="Try clearing search terms or filters." />
          </div>
        ) : (
          <div className="grid-row grid-head" style={{ "--grid-cols": columns.length } as React.CSSProperties}>
            <span className="mobile-check" />
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <button key={column.key} type="button" onClick={() => cycleSort(column.key)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  {column.label}
                  {active ? sort.dir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} /> : <ChevronsUpDown size={15} />}
                </button>
              );
            })}
          </div>
        )}
        {visible.map((row) => {
          const isSelected = selected.includes(row.id);
          return (
            <div
              key={row.id}
              data-row-id={row.id}
              className={isSelected ? "grid-row selected" : "grid-row"}
              style={{ "--grid-cols": columns.length } as React.CSSProperties}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,input,a,select")) return;
                toggle(row.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!selected.includes(row.id)) onSelectedChange([row.id]);
                setContextMenu({ x: event.clientX, y: event.clientY, row });
              }}
            >
              <input className="mobile-check" type="checkbox" checked={isSelected} onChange={() => toggle(row.id)} />
              {columns.map((column) => (
                <div key={column.key} className="grid-cell">
                  {column.render ? column.render(row) : String(row[column.key] ?? "")}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="context-menu-label">Row actions</div>
          <button type="button" onClick={() => { onSelectedChange(Array.from(new Set([...selected, contextMenu.row.id]))); setContextMenu(null); }}>
            <Check size={15} /> Add to selection
          </button>
          <button type="button" onClick={() => { onSelectedChange([contextMenu.row.id]); setContextMenu(null); }}>
            <Check size={15} /> Select only this row
          </button>
          <button type="button" onClick={() => { onSelectedChange(selected.filter((id) => id !== contextMenu.row.id)); setContextMenu(null); }}>
            <X size={15} /> Remove from selection
          </button>
        </div>
      ) : null}
    </div>
  );
}
