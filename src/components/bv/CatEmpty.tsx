import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Пустое состояние с котом-талисманом («Без Воды», раздел 9).
 *
 * Кот рисуется одной непрерывной линией — как процесс без воды, нигде
 * не прерывается — и появляется дозированно: пустые состояния как раз
 * его место. Правила: один кот на носитель, только контур, Графит,
 * без глаз и заливок. Путь взят из живого мудборда дизайн-системы.
 */
export const CatEmpty = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <Card data-testid={testId}>
    <CardContent className="px-6 py-10 text-center sm:py-12">
      <svg
        viewBox="0 0 280 220"
        fill="none"
        aria-hidden="true"
        className="mx-auto mb-4 h-auto w-[132px] text-foreground"
      >
        <path
          d="M36 182 C10 168 18 134 40 140 C58 145 56 166 42 170 C60 180 92 186 112 180 C140 172 118 150 122 122 C126 96 142 78 158 64 C166 57 172 52 174 40 L182 20 L192 36 C198 38 206 38 212 36 L222 22 L228 42 C236 56 234 74 222 84 C214 90 204 92 196 92 C202 110 204 132 200 152 C198 164 194 172 188 178 C184 181 176 182 170 180"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">{children}</p>
    </CardContent>
  </Card>
);
