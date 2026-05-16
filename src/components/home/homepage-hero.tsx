// ─────────────────────────────────────────────────────────────────────────
// HomepageHero — picks one of three hero variants based on the
// `home.hero` Setting row, then renders it.
//
//   typography → existing HeroMoonJar (default; brand voice via type)
//   video      → full-bleed 16:9 muted-loop with overlay typography
//   collage    → asymmetric 3-product editorial spread
//
// an admin switches variant in /admin/homepage/hero. No redeploy needed.
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
  if (cfg.variant === "collage") {
    const hasProductInList = cfg.colorBlockProducts.some(
      (p) => p.imageUrl.trim().length > 0,
    );
    const hasLegacy = cfg.collageUrls.some((u) => u.trim().length > 0);
    if (!hasProductInList && !hasLegacy) {
      return <HeroMoonJar copy={copy} />;
    }
  }

  switch (cfg.variant) {
    case "video":
      return (
        <HeroVideo
          copy={copy}
          videoUrl={cfg.videoUrl}
          poster={cfg.videoPoster}
          // Mobile-specific assets. Each one is optional — blank values
          // fall back to the desktop URLs inside HeroVideo, so partial
          // setups (e.g. mobile video uploaded but no mobile poster yet)
          // render sensibly without extra branches here.
          videoUrlMobile={cfg.videoUrlMobile}
          posterMobile={cfg.videoPosterMobile}
          objectPositionDesktop={cfg.videoObjectPositionDesktop}
          objectPositionMobile={cfg.videoObjectPositionMobile}
          // Admin stores poster timings in decimal seconds (friendlier
          // UX); HeroVideo expects milliseconds for setTimeout / CSS
          // transition. Convert here at the boundary.
          posterHoldMs={Math.round(cfg.videoPosterHoldSeconds * 1000)}
          posterFadeMs={Math.round(cfg.videoPosterFadeSeconds * 1000)}
        />
      );
    case "collage":
      return (
        <HeroCollage
          copy={copy}
          products={cfg.colorBlockProducts}
          legacyImageUrl={cfg.collageUrls[0]}
        />
      );
    default:
      return <HeroMoonJar copy={copy} />;
  }
}
