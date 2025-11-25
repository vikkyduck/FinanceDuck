import { useState, useCallback } from 'react';

export type ViewMode = 'table' | 'cards';

interface UseViewModeOptions {
  defaultMode?: ViewMode;
  storageKey?: string;
}

export function useViewMode(options: UseViewModeOptions = {}) {
  const { 
    defaultMode = 'cards',
    storageKey = 'invoices_view_mode'
  } = options;

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(storageKey);
    return (stored as ViewMode) || defaultMode;
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(storageKey, mode);
  }, [storageKey]);

  return { viewMode, setViewMode };
}
