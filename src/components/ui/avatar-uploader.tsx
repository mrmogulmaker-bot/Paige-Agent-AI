import { useCallback, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — plenty for a headshot, keeps loads snappy
const ACCEPT = "image/png,image/jpeg,image/webp";
const AVATARS_PUBLIC_MARKER = "/storage/v1/object/public/avatars/";

/** True only for a URL that points at our own avatars bucket. Rendering guards
 * on this so a profiles.avatar_url set to an off-site URL (a tracking pixel) is
 * never fetched by a viewer's browser. Empty is treated as "no photo". */
export function isAvatarBucketUrl(url?: string | null): boolean {
  return !!url && url.includes(AVATARS_PUBLIC_MARKER);
}

/** The storage object path for an avatars-bucket public URL, else null — used
 * by the parent to clean up the replaced file AFTER a successful save. */
export function avatarObjectPath(url?: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf(AVATARS_PUBLIC_MARKER);
  return i === -1 ? null : url.slice(i + AVATARS_PUBLIC_MARKER.length);
}

/** Best-effort removal of a replaced avatar object. Call from the parent's save
 * path once the new URL is persisted — never before, so a cancel/failed-save
 * can't orphan the live photo. Swallows errors (RLS blocks foreign folders). */
export async function removeAvatarObject(url?: string | null): Promise<void> {
  const path = avatarObjectPath(url);
  if (path) await supabase.storage.from("avatars").remove([path]).catch(() => {});
}

function initialsOf(name?: string | null): string {
  return (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export interface AvatarUploaderProps {
  /** Whose folder the file is written to — MUST be the signed-in user's id
   * (storage RLS only permits writes to avatars/<auth.uid>/…). */
  userId: string;
  /** Current avatar URL (empty string when none). */
  value: string;
  /** Called with the new public URL after upload, or "" after remove. The
   * parent owns persistence AND cleanup of the previous file (after save). */
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
 * URL — the parent decides when to persist it to profiles.avatar_url (and,
 * after a successful save, whether to clean up the replaced file via
 * removeAvatarObject). This component NEVER deletes storage on its own, so a
 * cancelled edit can't corrupt the live photo. Neutral styling only (gold is
 * reserved for the act/approve moment, §11).
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
  const showImage = isAvatarBucketUrl(value);

  const handleFile = useCallback(
    async (file: File) => {
      if (!userId) {
        toast.error("Can't upload a photo yet", { description: "Your account isn't fully loaded." });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("That's not an image", { description: "Pick a PNG, JPG, or WEBP." });
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
        onChange(data.publicUrl as string);
        toast.success("Photo ready — save to keep it");
      } catch (e: any) {
        toast.error("Upload failed", { description: e?.message ?? "Please try again." });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [userId, onChange],
  );

  const dim = { width: size, height: size };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative" style={dim}>
        <div
          className="flex items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground"
          style={dim}
        >
          {showImage ? (
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
            aria-label={showImage ? "Change profile photo" : "Add a profile photo"}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full bg-foreground/70 text-background",
              "opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
              busy && "opacity-100",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Camera className="h-5 w-5" />}
          </button>
        )}

        {/* Proxied by the labeled buttons below — keep it out of the tab/AT flow. */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {!disabled && (
        <div className="flex flex-col items-start gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded py-1.5 pr-2 font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {showImage ? "Change photo" : "Upload a photo"}
          </button>
          {showImage && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded py-1.5 pr-2 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
          <span className="text-muted-foreground">PNG, JPG, or WEBP — up to 3 MB.</span>
        </div>
      )}
    </div>
  );
}
