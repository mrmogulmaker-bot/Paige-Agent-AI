import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentAttachmentChipProps {
  fileName: string;
  onRemove: () => void;
}

export function DocumentAttachmentChip({ fileName, onRemove }: DocumentAttachmentChipProps) {
  return (
    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm">
      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
      <span className="truncate max-w-[200px] text-foreground">{fileName}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 rounded-full hover:bg-destructive/20"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
