import { ReactNode } from "react";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Фон кабинета — сетка узлов из дизайн-системы «Без Воды» (раздел 9,
 * «декоративные элементы»). Держится намеренно тихо: узлы едва различимы,
 * данные остаются главным. Декор функционален — он говорит «граф знаний»,
 * а не украшает.
 */
const NodeBackdrop = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" fill="none">
      <g stroke="hsl(var(--foreground))" strokeOpacity=".05" strokeWidth="1">
        <path d="M120 180 300 90 520 160M120 180 90 420 210 600M1480 220 1300 130 1080 200M1480 220 1520 480 1400 700" />
      </g>
      <g fill="hsl(var(--foreground))" fillOpacity=".05">
        <circle cx="120" cy="180" r="7" />
        <circle cx="300" cy="90" r="5" />
        <circle cx="520" cy="160" r="6" />
        <circle cx="90" cy="420" r="6" />
        <circle cx="210" cy="600" r="5" />
        <circle cx="1480" cy="220" r="7" />
        <circle cx="1300" cy="130" r="5" />
        <circle cx="1080" cy="200" r="6" />
        <circle cx="1520" cy="480" r="5" />
        <circle cx="1400" cy="700" r="6" />
      </g>
      {/* Один активный узел Пыльной розой — маркер системы */}
      <circle cx="520" cy="160" r="14" stroke="hsl(var(--ring))" strokeOpacity=".16" />
    </svg>
  </div>
);

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  // Initialize alert notifications system
  useAlertNotifications();

  return (
    <div className="relative min-h-screen bg-background">
      <NodeBackdrop />
      {/* max-w-screen-2xl (1536px) вместо 1280 — таблице счетов (10 колонок)
          не хватало ширины. mobile-first: max-width на узких экранах не мешает,
          там контент и так на всю ширину. `container` убран, чтобы не резать
          ширину на промежуточных брейкпоинтах (он капал на 1280 до 2xl). */}
      <div className="relative z-10 mx-auto w-full px-3 py-4 sm:px-6 sm:py-6 md:py-8 lg:py-10 max-w-screen-2xl">
        {children}
      </div>
    </div>
  );
};
