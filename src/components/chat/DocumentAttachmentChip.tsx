import { FileText, Image as ImageIcon, FileType, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttachedDocKind } from "@/hooks/useChatDocumentUpload";

interface DocumentAttachmentChipProps {
  fileName: string;
  kind?: AttachedDocKind;
  sizeBytes?: number;
  onRemove: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind?: AttachedDocKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "image":
      return "Image";
    case "docx":
      return "Word document";
    default:
      return "Document";
  }
}

function KindIcon({ kind }: { kind?: AttachedDocKind }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />;
  if (kind === "docx") return <FileType className="h-4 w-4 text-primary flex-shrink-0" />;
  return <FileText className="h-4 w-4 text-primary flex-shrink-0" />;
}

export function DocumentAttachmentChip({
  fileName,
  kind,
  sizeBytes,
  onRemove,
}: DocumentAttachmentChipProps) {
  const sizeLabel = formatBytes(sizeBytes);
  return (
    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm w-fit max-w-full">
      <KindIcon kind={kind} />
      <div className="min-w-0">
        <p className="truncate max-w-[200px] text-foreground text-[13px] leading-tight">
          {fileName}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {kindLabel(kind)}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 rounded-full hover:bg-destructive/20"
        onClick={onRemove}
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
