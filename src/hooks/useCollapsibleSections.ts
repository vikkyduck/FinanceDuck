import { useState, useEffect } from "react";

interface CollapsibleState {
  [key: string]: boolean;
}

export const useCollapsibleSections = (storageKey: string, defaultState: CollapsibleState = {}) => {
  const [sections, setSections] = useState<CollapsibleState>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return { ...defaultState, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Error loading collapsible sections state:", error);
    }
    return defaultState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sections));
    } catch (error) {
      console.error("Error saving collapsible sections state:", error);
    }
  }, [sections, storageKey]);

  const toggleSection = (sectionId: string) => {
    setSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const isExpanded = (sectionId: string) => {
    return sections[sectionId] !== false; // По умолчанию развёрнуто
  };

  const expandAll = () => {
    const allExpanded: CollapsibleState = {};
    Object.keys(sections).forEach((key) => {
      allExpanded[key] = true;
    });
    setSections(allExpanded);
  };

  const collapseAll = () => {
    const allCollapsed: CollapsibleState = {};
    Object.keys(sections).forEach((key) => {
      allCollapsed[key] = false;
    });
    setSections(allCollapsed);
  };

  return {
    isExpanded,
    toggleSection,
    expandAll,
    collapseAll,
  };
};
