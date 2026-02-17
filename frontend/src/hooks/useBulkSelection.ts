import { useState, useCallback } from "react";

export function useBulkSelection<T extends { id: string }>(filteredItems: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => 
      prev.size === filteredItems.length 
        ? new Set() 
        : new Set(filteredItems.map(item => item.id))
    );
  }, [filteredItems]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const isAllSelected = selectedIds.size > 0 && selectedIds.size === filteredItems.length;

  return { selectedIds, toggle, toggleAll, clear, isAllSelected };
}
