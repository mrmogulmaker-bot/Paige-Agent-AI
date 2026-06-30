import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * Consistent empty-state for client-view tiles. Use whenever a tile has no
 * real records yet — never seed sample data. Pair with a single primary CTA
 * that produces the missing data.
 */
export function EmptyTile({ icon, title, description, actionLabel, onAction, className }: Props) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center text-center py-8 px-6">
        {icon ? <div className="mb-3 text-muted-foreground/70">{icon}</div> : null}
        <div className="text-sm font-medium">{title}</div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>
        ) : null}
        {actionLabel && onAction ? (
          <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
