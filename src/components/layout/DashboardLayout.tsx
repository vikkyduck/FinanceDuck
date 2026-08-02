import { ReactNode, useEffect } from "react";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { startBvGlassEngine } from "@/lib/bvGlassEngine";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Слой 03 «Линза» жидкого стекла: одна карта смещения (feDisplacementMap)
 * обслуживает элементы любого размера — кромка карточек преломляет сцену
 * внутрь через backdrop-filter: url(#bv-lens). Кладётся один раз на страницу.
 */
const LensFilter = () => (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
    <filter id="bv-lens" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
      <feImage
        preserveAspectRatio="none"
        result="map"
        href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='x' x1='0' x2='1'><stop offset='0' stop-color='rgb(255,128,0)'/><stop offset='0.34' stop-color='rgb(128,128,0)'/><stop offset='0.66' stop-color='rgb(128,128,0)'/><stop offset='1' stop-color='rgb(0,128,0)'/></linearGradient><linearGradient id='y' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgb(0,255,0)'/><stop offset='0.34' stop-color='rgb(0,128,0)'/><stop offset='0.66' stop-color='rgb(0,128,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient></defs><rect width='100' height='100' fill='url(%23x)'/><rect width='100' height='100' fill='url(%23y)' style='mix-blend-mode:screen'/></svg>"
      />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="38" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

/**
 * Сцена кабинета — та же, что на экране входа (брендбук, разделы 7 и 11):
 * градиент бумаги + блобы розового стекла и стали + граф узлов с рёбрами.
 * Именно её преломляет и подцвечивает стекло карточек — без сцены материал
 * вырождается в плоскую серую плашку («стекло без фона — серая плашка»).
 * Композиция «рама»: узлы и рёбра работают по краям, центр спокоен под данными.
 */
const NodeBackdrop = () => (
  <div
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    aria-hidden="true"
    style={{ background: "linear-gradient(140deg, #F3F0EA 0%, #EAE6DF 52%, #DFDAD2 100%)" }}
  >
    <div
      className="absolute rounded-full"
      style={{ width: 640, height: 640, left: "-8%", top: "-18%", background: "radial-gradient(closest-side, rgba(233,196,189,.62), transparent 72%)" }}
    />
    <div
      className="absolute rounded-full"
      style={{ width: 760, height: 760, right: "-10%", top: "22%", background: "radial-gradient(closest-side, rgba(233,196,189,.5), rgba(233,196,189,.14) 60%, transparent)" }}
    />
    <div
      className="absolute rounded-full"
      style={{ width: 560, height: 560, left: "16%", bottom: "-24%", background: "radial-gradient(closest-side, rgba(150,158,172,.48), transparent)" }}
    />
    <div
      className="absolute rounded-full"
      style={{ width: 420, height: 420, left: "38%", top: "8%", background: "radial-gradient(closest-side, rgba(233,196,189,.28), transparent)" }}
    />
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" fill="none">
      {/* Техническая сетка — самым дальним планом */}
      <g stroke="#1D1F23" strokeOpacity=".05" strokeWidth="1">
        <path d="M0 190h1600M0 420h1600M0 650h1600M260 0v900M640 0v900M1060 0v900M1380 0v900" />
      </g>
      {/* Рёбра графа */}
      <g stroke="#1D1F23" strokeOpacity=".14" strokeWidth="1.2">
        <path d="M110 210 280 100 500 150" />
        <path d="M110 210 70 470 200 660M200 660 420 780" />
        <path d="M1500 240 1330 120 1120 170" />
        <path d="M1500 240 1540 520 1420 740M1540 520 1300 640" />
        <path d="M500 150 1120 170" strokeOpacity=".06" />
        <path d="M420 780 1300 640" strokeOpacity=".06" />
      </g>
      {/* Узлы */}
      <g fill="#1D1F23" fillOpacity=".34">
        <circle cx="110" cy="210" r="7" />
        <circle cx="280" cy="100" r="5" />
        <circle cx="500" cy="150" r="6" />
        <circle cx="70" cy="470" r="6" />
        <circle cx="200" cy="660" r="7" />
        <circle cx="420" cy="780" r="5" />
        <circle cx="1330" cy="120" r="5" />
        <circle cx="1120" cy="170" r="6" />
        <circle cx="1540" cy="520" r="6" />
        <circle cx="1420" cy="740" r="5" />
        <circle cx="1300" cy="640" r="6" />
      </g>
      {/* Один активный узел Пыльной розой с ореолом — маркер системы */}
      <circle cx="1500" cy="240" r="16" stroke="#A3564B" strokeOpacity=".4" />
      <circle cx="1500" cy="240" r="6" fill="#A3564B" fillOpacity=".85" />
    </svg>
  </div>
);

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  // Initialize alert notifications system
  useAlertNotifications();

  // Слои 05–06 материала: блик под курсором и перелив на всех стеклянных
  // элементах кабинета. Один движок на страницу, чистится при размонтировании.
  useEffect(() => startBvGlassEngine(), []);

  return (
    <div className="relative min-h-screen bg-background">
      <LensFilter />
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
