// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any -- Prototype component; prop types will be tightened on the design review pass. */
// Social Studio — the Campaigns → Social tab, reimagined.
// Design: Higgsfield × Opus Clip — dark cinematic canvas, glass-morphic
// content cards with live media previews, swipe-to-act gestures, a side
// editor that slides in, and a bottom-sheet composer. NEXUS operates,
// ZION interprets, the owner approves.
//
// Zones:
//   ① Presence Strip — thin bar of platform follower counts
//   ② Content Canvas — card feed with swipe/drag/tap gestures
//   ③ Side Editor — slides from the right on card tap
//   ④ Composer — bottom sheet on "+ New Post"
//   ⑤ ZION Insights — bottom slide-up cards with natural-language reads

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  BarChart3, Calendar, Check, ChevronRight, Copy, Eye, GripVertical,
  Image as ImageIcon, Plus, Sparkles, Trash2, Video, X, Zap
} from "lucide-react";

// ── Platform brand data ─────────────────────────────────────────────────────
const PLATFORM_META = {
  instagram: { name: "Instagram", color: "#E4405F", monogram: "Ig" },
  tiktok: { name: "TikTok", color: "#00F2EA", monogram: "Tt", dark: true },
  youtube: { name: "YouTube", color: "#FF0000", monogram: "Yt" },
  linkedin: { name: "LinkedIn", color: "#0A66C2", monogram: "in" },
  facebook: { name: "Facebook", color: "#1877F2", monogram: "f" },
  x: { name: "X", color: "#ffffff", monogram: "X" },
  threads: { name: "Threads", color: "#ffffff", monogram: "@" },
  pinterest: { name: "Pinterest", color: "#E60023", monogram: "P" },
  reddit: { name: "Reddit", color: "#FF4500", monogram: "r" },
  bluesky: { name: "Bluesky", color: "#0285FF", monogram: "☁" },
  discord: { name: "Discord", color: "#5865F2", monogram: "Dc" },
  telegram: { name: "Telegram", color: "#26A5E4", monogram: "Tg" },
  google_business: { name: "Google Business", color: "#4285F4", monogram: "GB" },
  snapchat: { name: "Snapchat", color: "#FFFC00", monogram: "Sc", dark: true },
};

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // overshoot spring

// ── Ambient background (shifts hue based on dominant platform) ─────────────
function AmbientCanvas({ dominantColor }: { dominantColor: string }) {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      background: `
        radial-gradient(ellipse 80% 50% at 50% 0%, ${dominantColor}11 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 80% 100%, ${dominantColor}08 0%, transparent 50%),
        #08080A
      `,
      transition: "background 1.2s ease",
    }} />
  );
}

// ── Glass card (the base material for content cards) ──────────────────────
function GlassCard({ children, style, onClick, className }: any) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: `all 0.3s ${SPRING}`,
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Platform badge chip ──────────────────────────────────────────────────────
function PlatformChip({ platform, size = "sm" }: { platform: string; size?: "sm" | "md" }) {
  const meta = PLATFORM_META[platform] ?? { name: platform, color: "#888", monogram: "?" };
  const s = size === "sm" ? { w: 22, h: 22, fs: 9 } : { w: 28, h: 28, fs: 11 };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{
        display: "grid", placeItems: "center", width: s.w, height: s.h,
        borderRadius: 6, background: meta.dark ? meta.color : `${meta.color}22`,
        color: meta.dark ? "#000" : meta.color, fontSize: s.fs, fontWeight: 800,
      }}>{meta.monogram}</span>
      {size === "md" && (
        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{meta.name}</span>
      )}
    </span>
  );
}

// ── Content Card (the main feed unit — swipeable, tappable) ────────────────
function ContentCard({ post, onOpen, onSwipe }: { post: any; onOpen: () => void; onSwipe: (dir: "left" | "right") => void }) {
  const [swipeX, setSwipeX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const [longPressTimer, setLongPressTimer] = useState<any>(null);

  const platforms = post.targets?.map((t: any) => t.platform) ?? [];
  const isPending = post.status === "pending_approval";
  const isScheduled = post.status === "scheduled";
  const isPublished = post.status === "published";
  const isDraft = post.status === "draft";

  const onPointerDown = (e: React.PointerEvent) => {
    startPos.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startPos.current.x;
    if (Math.abs(dx) > Math.abs(e.clientY - startPos.current.y)) {
      setSwipeX(dx * 0.6); // resistance
    }
  };
  const onPointerUp = () => {
    setIsDragging(false);
    if (swipeX < -80) { onSwipe("left"); }
    else if (swipeX > 80) { onSwipe("right"); }
    setSwipeX(0);
  };

  const gradient = isPending
    ? "linear-gradient(135deg, rgba(255,184,0,0.12), transparent)"
    : isPublished
      ? "linear-gradient(135deg, rgba(0,200,83,0.08), transparent)"
      : "none";

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => { if (Math.abs(swipeX) < 5) onOpen(); }}
      style={{
        transform: `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`,
        transition: isDragging ? "none" : `all 0.35s ${SPRING}`,
        opacity: Math.abs(swipeX) > 80 ? 0.3 : 1,
        flex: "none", width: 210, minHeight: 280,
        display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${isPending ? "rgba(255,184,0,0.3)" : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(20px)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4)${isPending ? ", 0 0 24px rgba(255,184,0,0.08)" : ""}`,
        cursor: "pointer", position: "relative",
      }}
    >
      {/* Media preview area */}
      <div style={{
        height: 140, display: "grid", placeItems: "center", position: "relative",
        background: gradient !== "none" ? gradient : `linear-gradient(135deg, ${platforms[0] ? (PLATFORM_META[platforms[0]]?.color ?? "#666") + "15" : "#333"}15, transparent)`,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {post.media_urls?.[0] ? (
          <img src={post.media_urls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 28, color: "rgba(255,255,255,0.15)" }}>
            {post.content_type === "video" ? <Video size={28} /> : post.content_type === "photos" ? <ImageIcon size={28} /> : <Sparkles size={28} />}
          </span>
        )}
        {/* Status overlay */}
        {isPending && (
          <div style={{
            position: "absolute", bottom: 8, left: 8, right: 8,
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.3)",
            color: "#FFB800",
            animation: "socialPulse 2s ease-in-out infinite",
          }}>
            ⏳ Waiting on you
          </div>
        )}
        {isScheduled && (
          <div style={{ position: "absolute", bottom: 8, left: 8, padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(0,200,83,0.12)", color: "#00C853", border: "1px solid rgba(0,200,83,0.2)" }}>
            📅 {new Date(post.scheduled_at).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(post.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* Content info */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {platforms.slice(0, 4).map((p: string) => <PlatformChip key={p} platform={p} />)}
          {platforms.length > 4 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>+{platforms.length - 4}</span>}
        </div>
        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {post.content}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <span style={{ fontSize: 10, color: isDraft ? "rgba(255,255,255,0.4)" : isPending ? "#FFB800" : isScheduled ? "#00C853" : "rgba(255,255,255,0.5)", fontWeight: 600 }}>
            {isDraft ? "Draft" : isPending ? "Pending" : isScheduled ? "Queued" : "Published"}
          </span>
          {isPublished && post.result?.engagement ? (
            <span style={{ fontSize: 10, color: "#00C853", fontWeight: 600 }}>
              {post.result.engagement} eng
            </span>
          ) : null}
        </div>
      </div>

      {/* Swipe hint overlays */}
      {swipeX < -40 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(239,68,68,0.15)", borderRadius: 16, pointerEvents: "none" }}>
          <Trash2 size={24} color="#ef4444" />
        </div>
      )}
      {swipeX > 40 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,184,0,0.15)", borderRadius: 16, pointerEvents: "none" }}>
          <Check size={24} color="#FFB800" />
        </div>
      )}
    </div>
  );
}

// ── Side Editor (slides in from the right) ─────────────────────────────────
function SideEditor({ post, onClose, onUpdate }: { post: any; onClose: () => void; onUpdate: (id: string, patch: any) => void }) {
  const [caption, setCaption] = useState(post.content);
  const [activePlatform, setActivePlatform] = useState(post.targets?.[0]?.platform ?? "instagram");
  const [scheduleDate, setScheduleDate] = useState(post.scheduled_at?.split("T")[0] ?? "");
  const [scheduleTime, setScheduleTime] = useState("10:00");

  const platforms = post.targets?.map((t: any) => t.platform) ?? [];
  const meta = PLATFORM_META[activePlatform] ?? PLATFORM_META.instagram;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 90vw)",
      zIndex: 100, display: "flex", flexDirection: "column",
      background: "rgba(12,12,14,0.95)", backdropFilter: "blur(30px)",
      borderLeft: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
      animation: `slideInRight 0.35s ${SPRING}`,
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Edit Post</span>
        <button onClick={onClose} style={{ background: "none", border: 0, color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "grid", placeItems: "center", padding: 6, borderRadius: 8, transition: "all .15s" }}>
          <X size={18} />
        </button>
      </div>

      {/* Live preview */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{
          borderRadius: 14, overflow: "hidden", border: `1px solid ${meta.color}33`,
          background: `linear-gradient(135deg, ${meta.color}11, transparent)`,
        }}>
          {/* Platform tab bar */}
          <div style={{ display: "flex", gap: 2, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", overflowX: "auto" }}>
            {platforms.map((p: string) => (
              <button key={p} onClick={() => setActivePlatform(p)}
                style={{
                  flex: "none", display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 8, border: 0, cursor: "pointer",
                  background: activePlatform === p ? `${PLATFORM_META[p]?.color}22` : "transparent",
                  transition: "background .15s",
                }}>
                <PlatformChip platform={p} />
              </button>
            ))}
          </div>
          {/* Preview body */}
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${meta.color}33`, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: meta.color }}>You</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>@yourbusiness</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>· now</span>
            </div>
            {post.media_urls?.[0] && (
              <img src={post.media_urls[0]} alt="" style={{ width: "100%", borderRadius: 10, aspectRatio: "4/3", objectFit: "cover" }} />
            )}
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>{caption}</p>
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              <span>♥ 0</span><span>💬 0</span><span>↗ 0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Caption editor */}
      <div style={{ padding: "0 20px 12px" }}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: ".08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          style={{
            width: "100%", minHeight: 80, padding: "10px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.85)", fontSize: 12.5, lineHeight: 1.5, resize: "vertical",
            outline: "none", transition: "border-color .2s",
          }}
          onFocus={(e) => e.target.style.borderColor = `${meta.color}55`}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
        />
      </div>

      {/* Schedule */}
      <div style={{ padding: "0 20px 12px" }}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: ".08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Schedule</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", fontSize: 12, outline: "none" }} />
          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
            style={{ width: 100, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", fontSize: 12, outline: "none" }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "8px 20px 20px", display: "flex", gap: 10, marginTop: "auto" }}>
        <button onClick={() => { onUpdate(post.id, { content: caption, status: "draft" }); onClose(); }}
          style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: 650, cursor: "pointer" }}>
          Save Draft
        </button>
        <button onClick={() => { onUpdate(post.id, { content: caption, status: "pending_approval" }); onClose(); }}
          style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: 0, background: "linear-gradient(135deg, #FFB800, #FF9500)", color: "#1a1000", fontSize: 12.5, fontWeight: 750, cursor: "pointer", boxShadow: "0 4px 16px rgba(255,184,0,0.3)" }}>
          ✓ Post Now
        </button>
      </div>

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}

// ── Composer (bottom sheet) ─────────────────────────────────────────────────
function Composer({ onClose, onPost }: { onClose: () => void; onPost: (data: any) => void }) {
  const [text, setText] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [showNexusHint, setShowNexusHint] = useState(false);

  const togglePlatform = (id: string) => {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      animation: "fadeIn .2s ease",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(680px, 95vw)", maxHeight: "80vh", overflowY: "auto",
        borderRadius: "24px 24px 0 0",
        background: "rgba(14,14,16,0.98)", backdropFilter: "blur(30px)",
        border: "1px solid rgba(255,255,255,0.1)", borderBottom: 0,
        boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        padding: "20px 24px 24px",
        animation: `slideUp 0.35s ${SPRING}`,
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.15)", margin: "0 auto 16px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 750, color: "#fff" }}>Create New Post</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: 0, borderRadius: 10, padding: 6, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={16} color="rgba(255,255,255,0.6)" />
          </button>
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your post… or ask NEXUS to create one"
          style={{
            width: "100%", minHeight: 100, padding: "14px 16px", borderRadius: 14,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.9)", fontSize: 13.5, lineHeight: 1.5, resize: "vertical",
            outline: "none", marginBottom: 12,
          }}
        />

        {/* NEXUS hint */}
        {!text && (
          <div onClick={() => setShowNexusHint(true)} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12,
            background: "rgba(228,64,95,0.08)", border: "1px solid rgba(228,64,95,0.15)",
            cursor: "pointer", marginBottom: 12, transition: "background .15s",
          }}>
            <Sparkles size={14} color="#E4405F" />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              <b style={{ color: "#E4405F" }}>NEXUS</b> can draft this for you — just describe the outcome
            </span>
          </div>
        )}

        {/* Platform selector */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {["instagram", "tiktok", "youtube", "linkedin", "facebook", "x", "threads", "pinterest"].map(p => {
            const active = platforms.includes(p);
            const meta = PLATFORM_META[p];
            return (
              <button key={p} onClick={() => togglePlatform(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                  borderRadius: 99, border: `1px solid ${active ? meta.color + "44" : "rgba(255,255,255,0.1)"}`,
                  background: active ? `${meta.color}18` : "transparent",
                  cursor: "pointer", transition: "all .15s",
                }}>
                <PlatformChip platform={p} size="sm" />
                <span style={{ fontSize: 11, fontWeight: 600, color: active ? meta.color : "rgba(255,255,255,0.5)" }}>{meta.name}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "12px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 650, cursor: "pointer" }}>
            Save Draft
          </button>
          <button
            onClick={() => { onPost({ content: text, platforms, content_type: text.length > 280 ? "text" : "text" }); onClose(); }}
            disabled={!text.trim() || platforms.length === 0}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 14, border: 0,
              background: text.trim() && platforms.length > 0
                ? "linear-gradient(135deg, #FFB800, #FF9500)" : "rgba(255,255,255,0.08)",
              color: text.trim() && platforms.length > 0 ? "#1a1000" : "rgba(255,255,255,0.3)",
              fontSize: 13, fontWeight: 750, cursor: text.trim() && platforms.length > 0 ? "pointer" : "default",
              transition: "all .2s",
            }}>
            ✓ Create Post
          </button>
        </div>

        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    </div>
  );
}

// ── Main Social Studio Component ────────────────────────────────────────────
export function SocialStudio() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [zionInsight, setZionInsight] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "pending_approval" | "scheduled" | "published">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load from paige_social_posts (RLS-gated to tenant)
      const { data, error: err } = await (window as any).__supabase
        ?.from("paige_social_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (err) throw err;
      setPosts(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter(p => p.status === filter);
  }, [posts, filter]);

  const dominantColor = useMemo(() => {
    const first = posts.find(p => p.targets?.[0]?.platform);
    return first ? PLATFORM_META[first.targets[0].platform]?.color ?? "#666" : "#666";
  }, [posts]);

  const counts = useMemo(() => ({
    draft: posts.filter(p => p.status === "draft").length,
    pending: posts.filter(p => p.status === "pending_approval").length,
    scheduled: posts.filter(p => p.status === "scheduled").length,
    published: posts.filter(p => p.status === "published").length,
  }), [posts]);

  const handleSwipe = async (post: any, dir: "left" | "right") => {
    if (dir === "left") {
      // Archive
      setPosts(prev => prev.filter(p => p.id !== post.id));
      // TODO: call the API to archive
    } else if (dir === "right" && post.status === "pending_approval") {
      // Approve & publish
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: "publishing" } : p));
      // TODO: call paige-social to publish
    }
  };

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <AmbientCanvas dominantColor={dominantColor} />

      {/* Header */}
      <div style={{ position: "relative", zIndex: 1, padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-.03em" }}>Social Studio</h2>
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>NEXUS operates · you approve · ZION interprets</p>
        </div>
        <button
          onClick={() => setShowComposer(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 99, border: 0, cursor: "pointer",
            background: "linear-gradient(135deg, #FFB800, #FF9500)",
            color: "#1a1000", fontSize: 12.5, fontWeight: 750,
            boxShadow: "0 4px 16px rgba(255,184,0,0.3)",
            transition: `transform .2s ${SPRING}, box-shadow .2s`,
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Presence strip */}
      <div style={{ position: "relative", zIndex: 1, padding: "0 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", overflowX: "auto" }}>
          {Object.entries(PLATFORM_META).slice(0, 6).map(([id, meta]) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
              <PlatformChip platform={id} size="sm" />
              <span style={{ fontSize: 11, fontWeight: 650, color: "rgba(255,255,255,0.7)" }}>—</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", alignSelf: "center", cursor: "pointer" }}>view all →</span>
        </div>
      </div>

      {/* Pipeline filter bar */}
      <div style={{ position: "relative", zIndex: 1, padding: "0 20px", marginBottom: 14, display: "flex", gap: 6 }}>
        {([
          ["all", "All", posts.length],
          ["draft", "Drafts", counts.draft],
          ["pending_approval", "Pending", counts.pending],
          ["scheduled", "Scheduled", counts.scheduled],
          ["published", "Published", counts.published],
        ] as const).map(([id, label, count]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
              borderRadius: 99, border: `1px solid ${filter === id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)"}`,
              background: filter === id ? "rgba(255,255,255,0.08)" : "transparent",
              cursor: "pointer", transition: "all .15s",
            }}>
            <span style={{ fontSize: 11.5, fontWeight: 650, color: filter === id ? "#fff" : "rgba(255,255,255,0.5)" }}>{label}</span>
            {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 99 }}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Content canvas */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
            <div style={{ fontSize: 28, color: "rgba(255,255,255,0.15)" }}>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          </div>
        ) : error ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", gap: 10 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{error}</p>
            <button onClick={() => void load()} style={{ padding: "6px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#FFB800", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", gap: 12, textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.05)", display: "grid", placeItems: "center" }}>
              <Sparkles size={20} color="rgba(255,255,255,0.2)" />
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 280, lineHeight: 1.5 }}>
              No posts here yet. Create your first post, or ask NEXUS to draft one for you.
            </p>
            <button onClick={() => setShowComposer(true)} style={{ padding: "8px 20px", borderRadius: 12, background: "linear-gradient(135deg, #FFB800, #FF9500)", border: 0, color: "#1a1000", fontSize: 12.5, fontWeight: 750, cursor: "pointer" }}>
              + Create Post
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingBottom: 20 }}>
            {filtered.map(post => (
              <ContentCard key={post.id} post={post} onOpen={() => setSelectedPost(post)} onSwipe={(dir) => void handleSwipe(post, dir)} />
            ))}
          </div>
        )}
      </div>

      {/* ZION insight card */}
      {zionInsight && (
        <div style={{
          position: "absolute", bottom: 20, left: 20, right: 20, zIndex: 50,
          padding: "12px 16px", borderRadius: 14,
          background: "rgba(10,102,194,0.12)", border: "1px solid rgba(10,102,194,0.25)",
          backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", gap: 10,
          animation: `slideUp 0.3s ${SPRING}`,
        }}>
          <BarChart3 size={16} color="#0A66C2" />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>{zionInsight}</span>
          <button onClick={() => setZionInsight(null)} style={{ background: "none", border: 0, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}

      {/* Overlays */}
      {selectedPost && (
        <SideEditor post={selectedPost} onClose={() => setSelectedPost(null)}
          onUpdate={(id, patch) => {
            setPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
          }}
        />
      )}
      {showComposer && (
        <Composer onClose={() => setShowComposer(false)}
          onPost={(data) => {
            const newPost = { id: crypto.randomUUID(), ...data, status: "draft", targets: data.platforms.map(p => ({ platform: p })), created_at: new Date().toISOString() };
            setPosts(prev => [newPost, ...prev]);
          }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes socialPulse {
          0%, 100% { opacity: 1; border-color: rgba(255,184,0,0.3); }
          50% { opacity: 0.7; border-color: rgba(255,184,0,0.15); }
        }
      `}</style>
    </div>
  );
}
