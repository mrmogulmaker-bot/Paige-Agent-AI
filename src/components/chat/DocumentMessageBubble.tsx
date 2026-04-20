import { FileText, Image as ImageIcon, FileType } from "lucide-react";
import type { AttachedDocKind } from "@/hooks/useChatDocumentUpload";

interface DocumentMessageBubbleProps {
  fileName: string;
  kind?: AttachedDocKind;
}

function kindLabel(kind?: AttachedDocKind): string {
  if (kind === "image") return "Image";
  if (kind === "docx") return "Word document";
  return "PDF document";
}

function KindIcon({ kind }: { kind?: AttachedDocKind }) {
  if (kind === "image") return <ImageIcon className="h-5 w-5 text-primary flex-shrink-0" />;
  if (kind === "docx") return <FileType className="h-5 w-5 text-primary flex-shrink-0" />;
  return <FileText className="h-5 w-5 text-primary flex-shrink-0" />;
}

export function DocumentMessageBubble({ fileName, kind }: DocumentMessageBubbleProps) {
  return (
    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2 mb-1">
      <KindIcon kind={kind} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
        <p className="text-[10px] text-muted-foreground">{kindLabel(kind)}</p>
      </div>
    </div>
  );
}
