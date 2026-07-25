import type { Icon } from "@tabler/icons-react";
import type * as React from "react";
import { cn } from "../ui/cn";

interface PanelSectionProps {
  icon: Icon;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PanelSection({
  icon: SectionIcon,
  label,
  action,
  children,
  className,
}: PanelSectionProps) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <SectionIcon className="size-3.5 text-muted-foreground" />
        <h2 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
