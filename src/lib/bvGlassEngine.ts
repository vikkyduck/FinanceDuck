/**
 * Движок «жидкого стекла» — слои 05 (блик) и 06 (перелив) из брендбука
 * «Без Воды» 2.4 «Сухой остаток» (раздел 7 и приложение).
 *
 * Один pointermove-обработчик на страницу: считает положение курсора
 * относительно видимых стеклянных элементов и раскладывает CSS-переменные
 * (--mx, --my, --sheen, --lg-glow, --tx/--ty). Все состояния остаются
 * в стилях — движок ничего, кроме переменных, не трогает.
 *
 * Не запускается без точного указателя и при prefers-reduced-motion:
 * там стекло остаётся статичным и ничего не теряет по смыслу.
 */

// .bv-sheen — перелив кнопок кабинета (класс .bv-btn занят кнопкой экрана
// входа в brand-auth.css — стили глобальны, имена пересекаться не должны).
const SELECTOR = ".bv-glass-card, .bv-glass-dark, .bv-glass-panel, .bv-sheen";

export function startBvGlassEngine(): () => void {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || calm) return () => {};

  let live: HTMLElement[] = [];
  const rects = new WeakMap<HTMLElement, DOMRect>();
  let dirty = true;
  let px = -1e4;
  let py = -1e4;
  let queued = false;

  // Геометрия кэшируется и пересчитывается на скролле/резайзе,
  // а не на каждом движении мыши; в кадре пишутся только переменные.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const i = live.indexOf(el);
        if (e.isIntersecting) {
          if (i < 0) live.push(el);
        } else if (i > -1) {
          live.splice(i, 1);
          el.style.removeProperty("--lg-glow");
        }
      }
      dirty = true;
    },
    { rootMargin: "140px" },
  );

  const observed = new WeakSet<Element>();
  const observeAll = (root: ParentNode) => {
    root.querySelectorAll?.(SELECTOR).forEach((el) => {
      if (!observed.has(el)) {
        observed.add(el);
        io.observe(el);
      }
    });
  };
  observeAll(document);

  // Кабинет — живой React-дом: карточки приходят после загрузки данных
  // и в диалогах, поэтому новые стеклянные элементы подхватываются сами.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (el.matches?.(SELECTOR) && !observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
        observeAll(el);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  const frame = () => {
    queued = false;
    if (dirty) {
      for (const el of live) rects.set(el, el.getBoundingClientRect());
      dirty = false;
    }
    for (const el of live) {
      const r = rects.get(el);
      if (!r || !r.width) continue;
      const fx = (px - r.left) / r.width;
      const fy = (py - r.top) / r.height;
      const dx = Math.max(r.left - px, 0, px - r.right);
      const dy = Math.max(r.top - py, 0, py - r.bottom);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const near = dist > 260 ? 0 : 1 - dist / 260;

      el.style.setProperty("--mx", `${(fx * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(fy * 100).toFixed(1)}%`);
      el.style.setProperty("--sheen", `${(100 + (fx - 0.5) * 110).toFixed(1)}deg`);

      // Кнопкам глубину даёт :hover в CSS (перелив 38–40%); карточки
      // держатся до 52% — выше перелив съедает контраст текста.
      if (!el.classList.contains("bv-sheen")) {
        el.style.setProperty("--lg-glow", (0.09 + 0.43 * near * near).toFixed(3));
      }

      // Наклон плоскости к руке — только компактные тёмные плитки:
      // широкую карточку с таблицей наклонять нельзя, поплывёт чтение.
      if (el.classList.contains("bv-glass-dark")) {
        if (dist === 0) {
          el.style.setProperty("--tx", `${(-(fy - 0.5) * 3.2).toFixed(2)}deg`);
          el.style.setProperty("--ty", `${((fx - 0.5) * 3.2).toFixed(2)}deg`);
        } else {
          el.style.setProperty("--tx", "0deg");
          el.style.setProperty("--ty", "0deg");
        }
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    if (!queued) {
      queued = true;
      requestAnimationFrame(frame);
    }
  };
  const onDirty = () => {
    dirty = true;
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  // capture — скроллятся и внутренние контейнеры (таблицы, диалоги)
  window.addEventListener("scroll", onDirty, { passive: true, capture: true });
  window.addEventListener("resize", onDirty, { passive: true });

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", onDirty, { capture: true });
    window.removeEventListener("resize", onDirty);
    io.disconnect();
    mo.disconnect();
    for (const el of live) el.style.removeProperty("--lg-glow");
    live = [];
  };
}
