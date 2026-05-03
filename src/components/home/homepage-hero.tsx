// ─────────────────────────────────────────────────────────────────────────
// HomepageHero — picks one of three hero variants based on the
// `home.hero` Setting row, then renders it.
//
//   typography → existing HeroMoonJar (default; brand voice via type)
//   video      → full-bleed 16:9 muted-loop with overlay typography
//   collage    → asymmetric 3-product editorial spread
//
// Sofia switches variant in /admin/homepage/hero. No redeploy needed.
// All three variants share the same `HeroCopy` shape so SiteCopy
// overrides flow through unchanged.
// ─────────────────────────────────────────────────────────────────────────

import { readHomeHeroSettings } from "@/lib/queries/home-hero";
import { HeroMoonJar, type HeroCopy } from "./hero-moon-jar";
import { HeroVideo } from "./hero-video";
import { HeroCollage } from "./hero-collage";

export async function HomepageHero({ copy }: { copy: HeroCopy }) {
  const cfg = await readHomeHeroSettings();

  // Defensive fallbacks: if the chosen variant has no usable assets
  // (e.g. video mode but no URL saved yet), drop back to the typography
  // hero so the homepage never renders a black box.
  if (cfg.variant === "video" && !cfg.videoUrl.trim()) {
    return <HeroMoonJar copy={copy} />;
  }
  if (
    cfg.variant === "collage" &&
    cfg.collageUrls.every((u) => !u.trim())
  ) {
    return <HeroMoonJar copy={copy} />;
  }

  switch (cfg.variant) {
    case "video":
      return (
        <HeroVideo
          copy={copy}
          videoUrl={cfg.videoUrl}
          poster={cfg.videoPoster}
        />
      );
    case "collage":
      return <HeroCollage copy={copy} imageUrls={cfg.collageUrls} />;
    default:
      return <HeroMoonJar copy={copy} />;
  }
}
