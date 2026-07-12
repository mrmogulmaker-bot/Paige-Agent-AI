import { useCallback, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — plenty for a headshot, keeps loads snappy
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function initialsOf(name?: string | null): string {
  return (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Strip an avatars-bucket public URL back to its storage path so we can remove
 * the old file after a successful replace (best-effort tidy — §12). */
function pathFromPublicUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/avatars/";
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

export interface AvatarUploaderProps {
  /** Whose folder the file is written to — MUST be the signed-in user's id
   * (storage RLS only permits writes to avatars/<auth.uid>/…). */
  userId: string;
  /** Current avatar URL (empty string when none). */
  value: string;
  /** Called with the new public URL after upload, or "" after remove. */
  onChange: (url: string) => void;
  /** Name used for the initials fallback. */
  name?: string | null;
  /** Diameter in px. Default 96. */
  size?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * A circular avatar with an inline "change photo" control. Uploads to the
 * public `avatars` bucket under the user's own folder and hands back the public
 * URL — the parent decides when to persist it to profiles.avatar_url. Neutral
 * styling only (gold is reserved for the act/approve moment, §11).
 */
export function AvatarUploader({
  userId,
  value,
  onChange,
  name,
  size = 96,
  disabled = false,
  className,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!userId) {
        toast.error("Can't upload a photo yet", { description: "Your account isn't fully loaded." });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("That's not an image", { description: "Pick a PNG, JPG, WEBP, or GIF." });
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("That image is too large", { description: "Keep it under 3 MB." });
        return;
      }
      setBusy(true);
      try {
        const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        const publicUrl = data.publicUrl as string;

        // Best-effort: remove the previous avatar so the folder doesn't grow.
        const prev = value ? pathFromPublicUrl(value) : null;
        if (prev && prev !== path) {
          await supabase.storage.from("avatars").remove([prev]).catch(() => {});
        }

        onChange(publicUrl);
        toast.success("Photo updated");
      } catch (e: any) {
        toast.error("Upload failed", { description: e?.message ?? "Please try again." });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [userId, value, onChange],
  );

  const handleRemove = useCallback(async () => {
    const prev = value ? pathFromPublicUrl(value) : null;
    onChange("");
    if (prev) await supabase.storage.from("avatars").remove([prev]).catch(() => {});
  }, [value, onChange]);

  const dim = { width: size, height: size };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative" style={dim}>
        <div
          className="flex items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground"
          style={dim}
        >
          {value ? (
            <img src={value} alt={name ? `${name}'s photo` : "Profile photo"} className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{initialsOf(name)}</span>
          )}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={value ? "Change profile photo" : "Add a profile photo"}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full bg-foreground/55 text-background",
              "opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
              busy && "opacity-100",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Camera className="h-5 w-5" />}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {!disabled && (
        <div className="flex flex-col gap-1 text-xs">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-left font-medium text-foreground hover:underline disabled:opacity-60"
          >
            {value ? "Change photo" : "Upload a photo"}
          </button>
          {value && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 text-left text-muted-foreground hover:text-destructive disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          )}
          <span className="text-muted-foreground">PNG, JPG, WEBP — up to 3 MB.</span>
        </div>
      )}
    </div>
  );
}
