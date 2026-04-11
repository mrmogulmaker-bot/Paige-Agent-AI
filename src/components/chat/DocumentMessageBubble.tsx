import { FileText } from "lucide-react";

interface DocumentMessageBubbleProps {
  fileName: string;
}

export function DocumentMessageBubble({ fileName }: DocumentMessageBubbleProps) {
  return (
    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2 mb-1">
      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
        <p className="text-[10px] text-muted-foreground">PDF Document</p>
      </div>
    </div>
  );
}
