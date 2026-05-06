// ─────────────────────────────────────────────────────────────────────────
// Deprecated 2026-05-06.
//
// We tried two flavours of live IG embed (raw iframe; embed.js script
// + blockquote) — both either get blocked by X-Frame-Options or
// import the IG chrome ("View profile" pill, like/save buttons, "Add
// a comment" box) which always reads as a stranded social embed
// instead of an editorial moment.
//
// The homepage Instagram section now uses image-only tiles (see
// instagram-section.tsx). Sofia uploads a thumbnail per post and the
// tile clicks through to the actual IG post.
//
// File kept (empty) so any stale imports surface as compile errors
// instead of confusing 404s. Safe to delete in a follow-up sweep.
// ─────────────────────────────────────────────────────────────────────────

export {};
