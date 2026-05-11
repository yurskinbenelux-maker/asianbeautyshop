import type { Config } from "tailwindcss";

// Asian Beauty Shop — ink & vermilion design tokens
// Source of truth for colours, fonts, radii, shadows. Edit here, not in components.

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.5rem", md: "2.5rem" },
      screens: { "2xl": "1320px" },
    },
    extend: {
      colors: {
        // ── rice-paper / hanji whites ──────────────────────────────────────
        rice:    "#F8F4EC",
        "rice-dim": "#EFE8DB",
        ivory:   "#FAF7F0",
        bone:    "#E6DDC9",

        // ── sumi ink ───────────────────────────────────────────────────────
        ink: {
          DEFAULT: "#121110",
          soft:    "#2A2622",
          mid:     "#5E5751",
          wash:    "#9E948A",
        },

        // ── vermilion (signature accent) ──────────────────────────────────
        vermilion: {
          DEFAULT: "#C8102E",
          2:       "#9B0E24",
          deep:    "#7A0A1A",
        },

        // ── rare accents ───────────────────────────────────────────────────
        gold: {
          DEFAULT: "#A78842",
          soft:    "#D7BE86",
        },
        celadon: "#6F8A7B",

        // ── shadcn tokens, mapped to the ink palette (semantic, not raw) ───
        background: "#F8F4EC",
        foreground: "#121110",
        card:             "#FAF7F0",
        "card-foreground": "#121110",
        popover:          "#FAF7F0",
        "popover-foreground": "#121110",
        primary:          "#121110",
        "primary-foreground": "#F8F4EC",
        secondary:        "#E6DDC9",
        "secondary-foreground": "#121110",
        muted:            "#EFE8DB",
        "muted-foreground": "#5E5751",
        accent:           "#C8102E",
        "accent-foreground": "#F8F4EC",
        destructive:      "#9B0E24",
        "destructive-foreground": "#F8F4EC",
        border:           "rgba(18,17,16,0.08)",
        input:            "rgba(18,17,16,0.12)",
        ring:             "#C8102E",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        kr:      ["var(--font-kr)", "serif"],
        sans:    ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Display scale for Hero B (Moon Jar)
        // Luxury polish #01: tightened tracking from -0.01em → -0.018em on
        // display sizes for that fashion-house "considered" feel. Lighter
        // line-height too (1.02 → 1.0) on the largest sizes — Fraunces is
        // an optical-size variable face and at clamp >96px the letters
        // already feel slightly loose at 1.02.
        "display-xl": ["clamp(48px, 7vw, 108px)", { lineHeight: "1.0",  letterSpacing: "-0.018em" }],
        "display-lg": ["clamp(44px, 6vw, 96px)",  { lineHeight: "1.02", letterSpacing: "-0.018em" }],
        "display-md": ["clamp(30px, 3.4vw, 54px)", { lineHeight: "1.08", letterSpacing: "-0.018em" }],
      },
      borderRadius: {
        // architectural, tight — no rounded corners on core surfaces
        none: "0",
        xs:   "2px",
        sm:   "3px",
        DEFAULT: "4px",
        md:   "6px",
        lg:   "8px",
        xl:   "14px",
        "2xl": "22px",
        full: "9999px",
      },
      letterSpacing: {
        eyebrow: "0.24em",
        label:   "0.14em",
        caps:    "0.08em",
      },
      boxShadow: {
        paper:     "0 40px 60px -40px rgba(18,17,16,0.2)",
        "ink-drop": "0 40px 80px -20px rgba(200,16,46,0.5)",
        card:      "0 40px 60px -30px rgba(18,17,16,0.25)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%":      { transform: "scale(1.04)" },
        },
        pulse_ring: {
          "0%":   { transform: "scale(0.8)", opacity: "0.6" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
        drift: {
          "0%":   { transform: "translate(0,0) rotate(0deg)",   opacity: "0" },
          "10%":  { opacity: "0.9" },
          "100%": { transform: "translate(var(--dx, 120px), var(--dy, 80px)) rotate(270deg)", opacity: "0" },
        },
        reveal: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        breathe:    "breathe 4s ease-in-out infinite",
        pulse_ring: "pulse_ring 3s ease-out infinite",
        drift:      "drift 12s linear infinite",
        reveal:     "reveal .6s ease both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
