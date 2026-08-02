interface DashboardHeaderProps {
  title: string;
  /** Подзаголовок-lead. Опционален: заголовок работает и один. */
  subtitle?: string;
}

export const DashboardHeader = ({ title, subtitle }: DashboardHeaderProps) => {
  return (
    <div className="mb-4 sm:mb-6 md:mb-8 lg:mb-10">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold mb-1 sm:mb-1.5 tracking-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
