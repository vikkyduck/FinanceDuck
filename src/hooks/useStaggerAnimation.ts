import { useEffect, useRef } from 'react';

export const useStaggerAnimation = (
  itemCount: number,
  baseDelay: number = 50,
  maxItems: number = 20
) => {
  const elementRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const adjustedDelay = itemCount > maxItems ? baseDelay / 2 : baseDelay;
    
    elementRefs.current.forEach((el, index) => {
      if (el) {
        requestAnimationFrame(() => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(10px)';
          
          setTimeout(() => {
            requestAnimationFrame(() => {
              el.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
              el.style.opacity = '1';
              el.style.transform = 'translateY(0)';
            });
          }, Math.min(index * adjustedDelay, 1000));
        });
      }
    });
  }, [itemCount, baseDelay, maxItems]);

  const setRef = (index: number) => (el: HTMLElement | null) => {
    elementRefs.current[index] = el;
  };

  return { setRef };
};
