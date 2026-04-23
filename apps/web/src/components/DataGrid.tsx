import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/Input";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

export function DataGrid<T extends { id: string }>({
  rows,
  columns,
  selected,
  onSelectedChange,
  empty = "No rows yet."
}: {
  rows: T[];
  columns: Column<T>[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  empty?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: keyof T & string; dir: "asc" | "desc" } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    const lower = query.toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(lower));
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const left = String(a[sort.key] ?? "");
      const right = String(b[sort.key] ?? "");
      return sort.dir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
  }, [query, rows, sort]);

  function toggle(id: string) {
    onSelectedChange(selected.includes(id) ? selected.filter((rowId) => rowId !== id) : [...selected, id]);
  }

  function selectRange(toIndex: number) {
    if (dragStart === null) return;
    const [start, end] = [Math.min(dragStart, toIndex), Math.max(dragStart, toIndex)];
    const range = visible.slice(start, end + 1).map((row) => row.id);
    onSelectedChange(Array.from(new Set([...selected, ...range])));
  }

  return (
    <div className="data-grid">
      <div className="grid-toolbar">
        <Search size={16} />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search, filter, or narrow rows" />
        <span>{selected.length} selected</span>
      </div>
      <div className="grid-table" ref={bodyRef}>
        <div className="grid-row grid-head">
          <span className="mobile-check" />
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              onClick={() => setSort((current) => ({ key: column.key, dir: current?.key === column.key && current.dir === "asc" ? "desc" : "asc" }))}
            >
              {column.label}
            </button>
          ))}
        </div>
        {visible.length === 0 ? <div className="empty">{empty}</div> : null}
        {visible.map((row, index) => {
          const isSelected = selected.includes(row.id);
          return (
            <div
              key={row.id}
              className={isSelected ? "grid-row selected" : "grid-row"}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).tagName === "INPUT") return;
                setDragging(true);
                setDragStart(index);
                if (!isSelected) toggle(row.id);
              }}
              onPointerEnter={() => {
                if (dragging) selectRange(index);
              }}
              onPointerUp={() => setDragging(false)}
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
    </div>
  );
}
