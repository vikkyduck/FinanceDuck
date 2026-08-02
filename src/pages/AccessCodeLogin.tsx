import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import "@/styles/brand-auth.css";

/**
 * Экран входа в дизайн-системе «Без Воды» 2.4 «Сухой остаток».
 *
 * Первый экран по разделу 11 брендбука: графическая сцена из узлов, над ней
 * стеклянная плашка, один срез в заголовке. Стекло лежит только на графике —
 * иначе преломлять нечего и материал превращается в серую плашку.
 * Иконок и эмодзи нет: смысл несут типографика и узлы.
 */

/** Слой 03 «Линза»: одна карта смещения обслуживает элементы любого размера. */
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

/** Сцена: граф узлов + техническая сетка. Именно её преломляет кромка стекла. */
const NodeScene = () => (
  <div className="bv-scene" aria-hidden="true">
    {/* Розовое стекло — материал под линзой карточки: кромке нужно что
        преломлять, иначе стекло вырождается в серую плашку. */}
    <div
      className="bv-blob"
      style={{
        width: "min(760px, 92vw)", height: "min(760px, 92vw)",
        left: "50%", top: "56%", transform: "translate(-50%, -50%)",
        background: "radial-gradient(closest-side, rgba(233,196,189,.72), rgba(233,196,189,.18) 62%, transparent)",
      }}
    />
    <div
      className="bv-blob"
      style={{ width: 420, height: 420, left: "-10%", top: "-14%", background: "radial-gradient(closest-side, rgba(233,196,189,.5), transparent)" }}
    />
    <div
      className="bv-blob"
      style={{ width: 380, height: 380, right: "-8%", bottom: "-16%", background: "radial-gradient(closest-side, rgba(150,158,172,.45), transparent)" }}
    />
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" fill="none">
      {/* Техническая сетка — самым дальним планом */}
      <g stroke="#1D1F23" strokeOpacity=".055" strokeWidth="1">
        <path d="M0 160h1200M0 320h1200M0 480h1200M0 640h1200M160 0v800M400 0v800M800 0v800M1040 0v800" />
      </g>
      {/* Рёбра графа. Композиция «рама»: узлы работают по краям, центр
          остаётся спокойным под заголовком и карточкой — иначе линии режут
          текст и превращаются в шум. */}
      <g stroke="#1D1F23" strokeOpacity=".17" strokeWidth="1.2">
        <path d="M80 250 210 120 360 70" />
        <path d="M80 250 150 520 60 700M150 520 330 660" />
        <path d="M1140 190 1010 110 860 66" />
        <path d="M1140 190 1080 470 1150 690M1080 470 900 640" />
        <path d="M360 70 860 66" strokeOpacity=".07" />
        <path d="M60 700 900 640" strokeOpacity=".07" />
      </g>
      {/* Узлы */}
      <g fill="#1D1F23" fillOpacity=".45">
        <circle cx="80" cy="250" r="7" />
        <circle cx="210" cy="120" r="5" />
        <circle cx="360" cy="70" r="6" />
        <circle cx="150" cy="520" r="8" />
        <circle cx="60" cy="700" r="5" />
        <circle cx="330" cy="660" r="6" />
        <circle cx="1010" cy="110" r="6" />
        <circle cx="860" cy="66" r="5" />
        <circle cx="1080" cy="470" r="7" />
        <circle cx="1150" cy="690" r="5" />
        <circle cx="900" cy="640" r="6" />
      </g>
      {/* Активный узел — Пыльная роза с ореолом. Один на сцену, у края. */}
      <circle cx="1140" cy="190" r="17" stroke="#A3564B" strokeOpacity=".45" />
      <circle cx="1140" cy="190" r="6" fill="#A3564B" />
    </svg>
  </div>
);

const AccessCodeLogin = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  /**
   * Слои 05–06: блик идёт за указателем, перелив поворачивается, плоскость
   * чуть наклоняется к руке. Не запускается без мыши и при reduced-motion —
   * там материал остаётся статичным и ничего не теряет по смыслу.
   */
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || calm) return;

    let queued = false;
    let px = -1e4;
    let py = -1e4;

    const frame = () => {
      queued = false;
      const els = sceneRef.current?.querySelectorAll<HTMLElement>(".bv-lg, .bv-btn");
      els?.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const fx = (px - r.left) / r.width;
        const fy = (py - r.top) / r.height;
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = dist > 260 ? 0 : 1 - dist / 260;

        el.style.setProperty("--mx", `${(fx * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(fy * 100).toFixed(1)}%`);
        el.style.setProperty("--sheen", `${(100 + (fx - 0.5) * 110).toFixed(1)}deg`);
        // Карточка держится до 52%: выше перелив съедает контраст текста.
        if (!el.classList.contains("bv-btn")) {
          el.style.setProperty("--lg-glow", (0.09 + 0.43 * near * near).toFixed(3));
        }
        if (dist === 0) {
          el.style.setProperty("--tx", `${(-(fy - 0.5) * 3.2).toFixed(2)}deg`);
          el.style.setProperty("--ty", `${((fx - 0.5) * 3.2).toFixed(2)}deg`);
        } else {
          el.style.setProperty("--tx", "0deg");
          el.style.setProperty("--ty", "0deg");
        }
      });
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(frame);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await login(code.toUpperCase());

      if (!result.success) {
        if (result.error === "account_locked" && result.locked_until) {
          const lockedUntil = new Date(result.locked_until);
          const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
          toast({
            variant: "destructive",
            title: "Вход временно закрыт",
            description: result.message || `Попробуйте через ${minutesRemaining} мин.`,
          });
        } else if (result.error === "invalid_code") {
          const attemptsRemaining = result.attempts_remaining ?? 0;
          toast({
            variant: "destructive",
            title: "Код не подошёл",
            description:
              attemptsRemaining <= 2 && attemptsRemaining > 0
                ? `Осталось попыток: ${attemptsRemaining}. Дальше вход закроется на время.`
                : result.message || "Проверьте код — он мог устареть",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Не удалось войти",
            description: result.message || "Повторите попытку через минуту",
          });
        }
        setLoading(false);
        return;
      }

      toast({ title: "Вход выполнен", description: "Открываю кабинет" });
      setTimeout(() => navigate("/"), 100);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Не удалось войти",
        description: "Проверьте связь и повторите",
      });
    }

    setLoading(false);
  };

  return (
    <div className="bv-auth" ref={sceneRef}>
      <LensFilter />
      <NodeScene />

      <motion.div
        style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 520 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 0.61, 0.24, 1] }}
      >
        <header style={{ marginBottom: "var(--space-lg)" }}>
          {/* Действующий логотип — исходная точка системы (трафаретный срез) */}
          <img
            src="/brand/logo-bv.png"
            alt="Без Воды"
            width={640}
            height={169}
            style={{
              width: 152, height: "auto", display: "block",
              marginBottom: "var(--space-md)",
              // PNG в градациях серого — подтягиваем к Графиту, иначе на бумаге блёкнет
              filter: "brightness(.72) contrast(1.15)",
            }}
          />
          {/* Срез на макете уже есть — он в трафаретном логотипе. Второй
              (в заголовке) запрещён: два жеста спорят между собой. */}
          <h1 className="bv-h1" style={{ marginBottom: "var(--space-sm)" }}>
            Личный кабинет
          </h1>
          <p className="bv-lead" style={{ maxWidth: "42ch" }}>
            Счета, платежи и расходы по проектам
          </p>
        </header>

        <div className="bv-lg" style={{ padding: "var(--space-xl) var(--space-lg)" }}>
          <form onSubmit={handleLogin}>
            <label htmlFor="code" className="bv-label" style={{ display: "block", marginBottom: "var(--space-2xs)" }}>
              Код доступа
            </label>
            <input
              id="code"
              type="text"
              className="bv-input"
              placeholder="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={loading}
              autoFocus
              autoComplete="one-time-code"
              spellCheck={false}
              data-testid="input-access-code"
            />
            <p className="bv-caption" style={{ margin: "var(--space-2xs) 0 var(--space-md)" }}>
              Регистр не важен — приведём к верхнему сами.
            </p>
            <button
              type="submit"
              className="bv-btn"
              disabled={loading || !code}
              data-testid="button-login"
            >
              <span>{loading ? "Проверяю код" : "Войти"}</span>
            </button>
          </form>
        </div>

        <p className="bv-caption" style={{ marginTop: "var(--space-md)" }}>
          Нет кода или он не работает — напишите{" "}
          <a className="bv-link" href="mailto:vu@withoutwater.ru">
            vu@withoutwater.ru
          </a>
        </p>
      </motion.div>
    </div>
  );
};

export default AccessCodeLogin;
