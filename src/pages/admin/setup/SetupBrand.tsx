// Setup › Brand (1c-xi) — the Marketing home. Mounts the tenant BrandKit editor
// (logo, palette, voice tokens) that Paige forges every design from. Coach-visible:
// no RoleGate here — every staffer authors their own brand (§7 tenant-authored,
// §9 tenant-scoped inside the panel). §11 lean plain header, no hero.
import { Palette } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ui/page";
import { BrandKitPanel } from "@/components/admin/brand/BrandKitPanel";

export default function SetupBrand() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Palette}
        eyebrow="Marketing"
        title="Brand"
        description="Your logo, colors, and voice — the brand every page, email, and asset Paige builds is drawn from."
      />
      <BrandKitPanel />
    </PageShell>
  );
}
