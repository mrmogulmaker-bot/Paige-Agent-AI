import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export type AttachedDocKind = "pdf" | "image" | "docx";

const ACCEPTED_MIME_BY_KIND: Record<AttachedDocKind, string[]> = {
  pdf: ["application/pdf"],
  image: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

const ALL_ACCEPT_STRING =
  "application/pdf,image/jpeg,image/png,image/webp," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function detectKind(mime: string, name: string): AttachedDocKind | null {
  if (ACCEPTED_MIME_BY_KIND.pdf.includes(mime)) return "pdf";
  if (ACCEPTED_MIME_BY_KIND.image.includes(mime)) return "image";
  if (ACCEPTED_MIME_BY_KIND.docx.includes(mime)) return "docx";
  // Some browsers report empty mime for DOCX
  if (/\.docx$/i.test(name)) return "docx";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(jpe?g|png|webp)$/i.test(name)) return "image";
  return null;
}

export interface AttachedDocument {
  file: File;
  name: string;
  kind: AttachedDocKind;
  mimeType: string;
  size: number;
  /** base64 of the raw bytes (for PDF + image). Empty for docx. */
  base64: string;
  /** Plain-text content extracted client-side (DOCX only). */
  textContent?: string;
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function extractDocxText(file: File): Promise<string> {
  // Lazy-load mammoth so it doesn't bloat the initial chunk.
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer });
  return (result?.value || "").trim();
}

export function useChatDocumentUpload() {
  const [attachedDoc, setAttachedDoc] = useState<AttachedDocument | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processFile = useCallback(
    async (file: File) => {
      const kind = detectKind(file.type, file.name);
      if (!kind) {
        toast({
          title: "Unsupported file type",
          description: "Paige can read PDF, JPG, PNG, WEBP, and DOCX files.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB.",
          variant: "destructive",
        });
        return;
      }

      setIsProcessingFile(true);
      try {
        if (kind === "docx") {
          const textContent = await extractDocxText(file);
          if (!textContent) {
            toast({
              title: "Could not read DOCX",
              description:
                "The document appears empty or unreadable. Try saving it as a PDF.",
              variant: "destructive",
            });
            return;
          }
          setAttachedDoc({
            file,
            name: file.name,
            kind,
            mimeType: file.type ||
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: file.size,
            base64: "",
            textContent,
          });
        } else {
          const base64 = await fileToBase64(file);
          setAttachedDoc({
            file,
            name: file.name,
            kind,
            mimeType:
              file.type || (kind === "pdf" ? "application/pdf" : "image/png"),
            size: file.size,
            base64,
          });
        }
      } catch (err) {
        console.error("File processing failed:", err);
        toast({
          title: "Error reading file",
          description:
            "Could not process the file. Please try a different one.",
          variant: "destructive",
        });
      } finally {
        setIsProcessingFile(false);
      }
    },
    [toast],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      if (e.target) e.target.value = "";
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const removeAttachment = useCallback(() => {
    setAttachedDoc(null);
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    attachedDoc,
    isProcessingFile,
    isDragOver,
    fileInputRef,
    acceptString: ALL_ACCEPT_STRING,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeAttachment,
    openFilePicker,
    setAttachedDoc,
  };
}
