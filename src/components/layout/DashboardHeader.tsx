interface DashboardHeaderProps {
  title: string;
  subtitle: string;
}

export const DashboardHeader = ({ title, subtitle }: DashboardHeaderProps) => {
  return (
    <div className="mb-10">
      <h1 className="text-3xl font-semibold mb-1.5 tracking-tight">
        {title}
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
};
