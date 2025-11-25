import { useState, useEffect } from 'react';

const STORAGE_KEY = 'assistant-stats-year';
const CURRENT_YEAR = new Date().getFullYear();

export const useYearFilter = () => {
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : CURRENT_YEAR;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedYear.toString());
  }, [selectedYear]);

  const availableYears = [2024, 2025, 2026];

  return {
    selectedYear,
    setSelectedYear,
    availableYears,
  };
};
