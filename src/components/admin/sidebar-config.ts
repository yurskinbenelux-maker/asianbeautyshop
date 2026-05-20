// ─────────────────────────────────────────────────────────────────────────
// Shared admin navigation config.
//
// Single source of truth for the sections list, role labels, and badge-
// count typing. Both the desktop AdminSidebar (left rail, md+) and the
// mobile AdminMobileNav (hamburger + drawer, below md) import from here
// so that one change to the nav structure updates both surfaces.
//
// Why a separate file: the sidebar component is `"use client"`. Putting
// the sections array in the same file forces every consumer to pull in
// the client component too. Splitting the config keeps it serialisable
// and importable from any context.
// ─────────────────────────────────────────────────────────────────────────

import {
  LayoutDashboard,
  Package,
  Tag,
  ShoppingBag,
  Users,
  Image as ImageIcon,
  Settings,
  BadgePercent,
  LayoutPanelTop,
  MessageSquare,
  Mail,
  Quote,
  BookOpen,
  FileText,
  PenSquare,
  Send,
  RotateCcw,
  CornerDownRight,
  History,
  Beaker,
  Gift,
  FileSpreadsheet,
  Sparkles,
  Megaphone,
  Banknote,
} from "lucide-react";
import type {
  AdminCapability,
  AdminRole,
} from "@/lib/auth-roles-shared";

export type AdminSection = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Capability required to see this section. UX-only filter — the page
   *  itself still enforces access via requireCapability(...). */
  cap: AdminCapability;
  /** When set, the sidebar looks up `counts[badgeKey]` and renders a red
   *  dot with the number. */
  badgeKey?: "ordersAwaitingShipment" | "returnsAwaitingRefund";
};

export type AdminSidebarBadgeCounts = {
  ordersAwaitingShipment: number;
  returnsAwaitingRefund: number;
};

/**
 * Ordered top-to-bottom roughly by mental model: content first,
 * operations next, platform last. Same order on both desktop and mobile
 * so admin muscle memory transfers between devices.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin",             label: "Overview",      icon: LayoutDashboard,  cap: "products.view" },
  { href: "/admin/products",    label: "Products",      icon: Package,          cap: "products.view" },
  { href: "/admin/categories",  label: "Categories",    icon: Tag,              cap: "categories.edit" },
  { href: "/admin/ingredients", label: "Ingredients",   icon: Beaker,           cap: "ingredients.edit" },
  { href: "/admin/quiz-tester", label: "Quiz tester",   icon: Sparkles,         cap: "products.view" },
  { href: "/admin/orders",      label: "Orders",        icon: ShoppingBag,      cap: "orders.view", badgeKey: "ordersAwaitingShipment" },
  { href: "/admin/invoices",    label: "Invoices",      icon: FileSpreadsheet,  cap: "orders.view" },
  { href: "/admin/billit",      label: "Billit",        icon: Banknote,         cap: "billit.view" },
  { href: "/admin/returns",     label: "Returns",       icon: RotateCcw,        cap: "returns.view", badgeKey: "returnsAwaitingRefund" },
  { href: "/admin/customers",   label: "Customers",     icon: Users,            cap: "customers.view" },
  { href: "/admin/coupons",     label: "Coupons",       icon: BadgePercent,     cap: "coupons.edit" },
  { href: "/admin/gift-cards",  label: "Gift cards",    icon: Gift,             cap: "giftcards.view" },
  { href: "/admin/loyalty",     label: "A-Beauty Club", icon: Sparkles,         cap: "loyalty.edit" },
  { href: "/admin/reviews",     label: "Reviews",       icon: MessageSquare,    cap: "reviews.moderate" },
  { href: "/admin/contact",     label: "Messages",      icon: Mail,             cap: "contact.view" },
  { href: "/admin/testimonials", label: "Testimonials", icon: Quote,            cap: "testimonials.edit" },
  { href: "/admin/banners",     label: "Banners",       icon: LayoutPanelTop,   cap: "banners.edit" },
  { href: "/admin/homepage",    label: "Website copy",  icon: PenSquare,        cap: "homepage.edit" },
  { href: "/admin/marketing",   label: "Marketing",     icon: Megaphone,        cap: "homepage.edit" },
  { href: "/admin/journal",     label: "Journal",       icon: BookOpen,         cap: "journal.edit" },
  { href: "/admin/pages",       label: "Pages",         icon: FileText,         cap: "pages.edit" },
  { href: "/admin/media",       label: "Media",         icon: ImageIcon,        cap: "media.edit" },
  { href: "/admin/emails",      label: "Emails",        icon: Send,             cap: "emails.send" },
  { href: "/admin/redirects",   label: "Redirects",     icon: CornerDownRight,  cap: "redirects.edit" },
  { href: "/admin/audit",       label: "Audit log",     icon: History,          cap: "audit.view" },
  { href: "/admin/settings",    label: "Settings",      icon: Settings,         cap: "settings.view" },
];

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  FULFILMENT: "Fulfilment",
};
