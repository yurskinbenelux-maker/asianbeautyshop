// ─────────────────────────────────────────────────────────────────────────
// Instagram Graph API client — server-only.
//
// This is the official Meta API for pulling posts from a Business or
// Creator account. NOT the Basic Display API (deprecated end of 2024).
//
// What you need to use this:
//   1. an admin converts her IG account to a Business or Creator account.
//   2. an admin creates a Facebook Page (any name — IG accounts must link
//      to a Page to access the Graph API).
//   3. The IG account is connected to that Facebook Page.
//   4. You create a Meta developer account at developers.facebook.com
//      and create an app of type "Business".
//   5. Add the "Instagram Graph API" product to the app.
//   6. Generate a User Access Token with `instagram_basic` +
//      `pages_show_list` scopes.
//   7. Exchange that for a long-lived (60-day) token.
//   8. Find the IG Business Account ID via /{page-id}?fields=instagram_business_account
//   9. Save both in /admin/marketing/instagram.
//
// The cron at /api/cron/instagram-sync calls this client every few
// hours, refreshes the cached posts, and rotates the long-lived token
// before it expires.
//
// All endpoints are on graph.facebook.com (not graph.instagram.com —
// that's the Basic Display API).
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

const API_BASE = "https://graph.facebook.com/v21.0";

export type IgMediaItem = {
  id: string;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM */
  media_type: string;
  /** CDN URL of the image (or video file). */
  media_url: string;
  /** Poster frame for VIDEO. Undefined for IMAGE. */
  thumbnail_url?: string;
  /** instagram.com/p/.../ URL. */
  permalink: string;
  /** Full caption text — can be empty/undefined. */
  caption?: string;
  /** ISO timestamp of when the post was published. */
  timestamp: string;
};

export type GraphApiError = {
  message: string;
  type?: string;
  code?: number;
  /** Subcode 463 = token expired; 467 = token invalid */
  error_subcode?: number;
  fbtrace_id?: string;
};

/**
 * Fetch the most recent N media items from the connected IG account.
 *
 * Throws on any non-200 response — call sites should `try/catch` and
 * record the message in Setting `instagram.lastSyncError` so admin
 * can see what's wrong.
 */
export async function fetchUserMedia(args: {
  accessToken: string;
  igUserId: string;
  /** Max number of items to fetch. The Graph API caps at 100/page. */
  limit?: number;
}): Promise<IgMediaItem[]> {
  const limit = Math.min(args.limit ?? 25, 100);
  const fields = [
    "id",
    "media_type",
    "media_url",
    "thumbnail_url",
    "permalink",
    "caption",
    "timestamp",
  ].join(",");

  const url = new URL(`${API_BASE}/${args.igUserId}/media`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", args.accessToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    // Never cache — we want a fresh read every sync.
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    data?: IgMediaItem[];
    error?: GraphApiError;
  } | null;

  if (!res.ok || !json) {
    const err = json?.error;
    throw new Error(
      err
        ? `IG Graph API ${res.status}: ${err.message} (code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})`
        : `IG Graph API ${res.status}: ${await res.text().catch(() => "no body")}`,
    );
  }

  return json.data ?? [];
}

/**
 * Verify that an access token + IG user ID combination works without
 * actually pulling media. Used by the admin's "Test connection" button
 * to give an admin immediate feedback when she pastes a token.
 *
 * Returns the IG account's username on success, or throws.
 */
export async function verifyConnection(args: {
  accessToken: string;
  igUserId: string;
}): Promise<{ username: string; profilePictureUrl?: string }> {
  const url = new URL(`${API_BASE}/${args.igUserId}`);
  url.searchParams.set("fields", "username,profile_picture_url");
  url.searchParams.set("access_token", args.accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as {
    username?: string;
    profile_picture_url?: string;
    error?: GraphApiError;
  } | null;

  if (!res.ok || !json || !json.username) {
    const err = json?.error;
    throw new Error(
      err
        ? `IG Graph API ${res.status}: ${err.message}`
        : `IG Graph API ${res.status}: connection check failed`,
    );
  }

  return {
    username: json.username,
    profilePictureUrl: json.profile_picture_url,
  };
}

/**
 * Refresh a long-lived user access token (60-day) before it expires.
 * Call this from the cron when the token has < 7 days remaining.
 *
 * Meta returns a new token that resets the 60-day clock; the old
 * token continues to work until its original expiry.
 *
 * Note: long-lived tokens can only be refreshed once they're at least
 * 24 hours old. Don't call this immediately after exchange.
 */
export async function refreshLongLivedToken(args: {
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(`${API_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", args.accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: GraphApiError;
  } | null;

  if (!res.ok || !json?.access_token) {
    const err = json?.error;
    throw new Error(
      err
        ? `IG token refresh ${res.status}: ${err.message}`
        : `IG token refresh ${res.status}: no token returned`,
    );
  }

  return {
    accessToken: json.access_token,
    expiresInSeconds: json.expires_in ?? 60 * 24 * 60 * 60,
  };
}
