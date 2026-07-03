import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualizedListProps<T> {
  items: T[];
  /** Высота одной строки в пикселях. Для variable-size — функция (index) => px. */
  rowHeight: number | ((index: number, item: T) => number);
  /** Максимальная высота окна виртуализации. На мобильном меньше, на десктопе — больше. */
  maxHeight: number;
  /** Сколько строк отрисовывать дополнительно за пределами viewport. */
  overscan?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Уникальный ключ строки. По умолчанию index. */
  getRowKey?: (item: T, index: number) => string | number;
  className?: string;
}

/**
 * Базовая виртуализация для списков. На любом интервале времени в DOM
 * находится ~`viewport / rowHeight + overscan` строк, а не весь массив.
 * Используется только когда `items.length > порог` — для маленьких списков
 * прямой рендер быстрее.
 */
export function VirtualizedList<T>({
  items,
  rowHeight,
  maxHeight,
  overscan = 6,
  renderRow,
  getRowKey,
  className,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize:
      typeof rowHeight === "function"
        ? (i) => rowHeight(i, items[i])
        : () => rowHeight,
    overscan,
  });

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={`overflow-auto contain-strict ${className || ""}`}
      style={{ maxHeight }}
      data-testid="virtualized-list"
    >
      <div style={{ height: totalSize, position: "relative", width: "100%" }}>
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          const key = getRowKey ? getRowKey(item, virtualItem.index) : virtualItem.index;
          return (
            <div
              key={key}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderRow(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Порог, при котором имеет смысл включать виртуализацию (Cook = 100). */
export const VIRTUALIZATION_THRESHOLD = 100;
