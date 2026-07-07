import React from "react";

// Site-wide animated background that never overlaps content
export function SiteBackground() {
  return (
    <div className="fixed inset-0 -z-50 pointer-events-none overflow-hidden">
      {/* Soft animated purple orbs behind content only - cinematic ambience */}
      <div className="absolute -top-24 -left-24 w-[60vw] h-[60vw] max-w-[42rem] max-h-[42rem] bg-accent/[0.12] rounded-full blur-3xl animate-float" />
      <div className="absolute top-1/3 -right-32 w-[50vw] h-[50vw] max-w-[36rem] max-h-[36rem] bg-[#7c3aed]/[0.1] rounded-full blur-3xl animate-float-slow" />
      <div className="absolute -bottom-24 left-1/4 w-[45vw] h-[45vw] max-w-[32rem] max-h-[32rem] bg-[#a855f7]/[0.08] rounded-full blur-3xl animate-float-delayed" />
    </div>
  );
}

export default SiteBackground;
