-- =========================================================================
-- WIPE TEST DATA — pre-launch reset for Asian Beauty Shop
-- =========================================================================
--
-- HOW TO USE:
--   1. Take a Supabase snapshot first (Supabase Studio → Database → Backups).
--   2. Open Supabase Studio → SQL Editor → new query.
--   3. First run the SELECT block at the bottom (the "preview" section) to
--      see counts of what will go.
--   4. Then run the wipe block (everything between BEGIN; and COMMIT;).
--      Single transaction — if anything fails it all rolls back.
--   5. After SQL: clean Supabase Storage (steps at the bottom of this file).
--
-- WHAT THIS WIPES:
--   • Every Order + cascading data (OrderItem, OrderEvent, ReturnRequest,
--     ReturnItem, Invoice, CreditNote, CreditNoteItem)
--   • InventoryMovement rows (so stock history starts fresh)
--   • LoyaltyEvent rows (clawback/accrual history)
--   • LoyaltyAccount balances reset to 0 (rows stay, balances cleared)
--   • GiftCard rows + GiftCardRedemption (test purchases + claims)
--   • Cart + CartItem (abandoned carts, leftover sessions)
--   • QuizCompletion (test quiz coupons + reward state)
--   • AiConversation + AiMessage (test chats with the skin assistant)
--   • Review rows (test product reviews)
--   • WishlistItem (test wishlists)
--   • Coupon.redeemCount reset to 0 (keeps coupon definitions, clears use count)
--   • AuditLog wiped (start the production audit trail fresh)
--   • Setting rows for invoice.next.* and creditnote.next.* (counters back to 1)
--   • BackInStockSubscription (test subscriptions)
--   • VisitorPing rows (live-visitors widget data)
--   • ProductSubscription rows (test recurring orders)
--
-- WHAT STAYS:
--   • All catalog: Product, ProductVariant, Brand, Category, Ingredient,
--     SkinType, Concern, Benefit, RitualStep, Media (and all *Translation tables)
--   • All content: SiteCopy, Testimonial, Banner, JournalPost, Page,
--     InstagramPost, EmailCopyOverride, Setting (except counters)
--   • All admin config: shipping settings, tax, AI prompts, promotions
--   • Coupon definitions (only redeemCount resets — discount % / cap stay)
--   • User accounts (so the admin user survives — see notes below if you
--     also want to wipe test customer accounts)
--   • NewsletterSubscriber and ContactMessage (could be real signups —
--     review manually in admin if needed)
--   • LoyaltyAccount, LoyaltyTier, LoyaltyReward, LoyaltyTask configs
--   • Referral codes
--
-- =========================================================================


-- =========================================================================
-- PREVIEW — run this first to see what WILL be deleted
-- =========================================================================

SELECT 'Order'                       AS table_name, COUNT(*) FROM "Order"
UNION ALL SELECT 'OrderItem',                       COUNT(*) FROM "OrderItem"
UNION ALL SELECT 'OrderEvent',                      COUNT(*) FROM "OrderEvent"
UNION ALL SELECT 'ReturnRequest',                   COUNT(*) FROM "ReturnRequest"
UNION ALL SELECT 'ReturnItem',                      COUNT(*) FROM "ReturnItem"
UNION ALL SELECT 'Invoice',                         COUNT(*) FROM "Invoice"
UNION ALL SELECT 'CreditNote',                      COUNT(*) FROM "CreditNote"
UNION ALL SELECT 'CreditNoteItem',                  COUNT(*) FROM "CreditNoteItem"
UNION ALL SELECT 'InventoryMovement',               COUNT(*) FROM "InventoryMovement"
UNION ALL SELECT 'LoyaltyEvent',                    COUNT(*) FROM "LoyaltyEvent"
UNION ALL SELECT 'GiftCard',                        COUNT(*) FROM "GiftCard"
UNION ALL SELECT 'GiftCardRedemption',              COUNT(*) FROM "GiftCardRedemption"
UNION ALL SELECT 'Cart',                            COUNT(*) FROM "Cart"
UNION ALL SELECT 'CartItem',                        COUNT(*) FROM "CartItem"
UNION ALL SELECT 'QuizCompletion',                  COUNT(*) FROM "QuizCompletion"
UNION ALL SELECT 'AiConversation',                  COUNT(*) FROM "AiConversation"
UNION ALL SELECT 'Review',                          COUNT(*) FROM "Review"
UNION ALL SELECT 'WishlistItem',                    COUNT(*) FROM "WishlistItem"
UNION ALL SELECT 'AuditLog',                        COUNT(*) FROM "AuditLog"
UNION ALL SELECT 'BackInStockSubscription',         COUNT(*) FROM "BackInStockSubscription"
UNION ALL SELECT 'VisitorPing',                     COUNT(*) FROM "VisitorPing"
UNION ALL SELECT 'ProductSubscription',             COUNT(*) FROM "ProductSubscription"
UNION ALL SELECT 'Setting (invoice/CN counters)',
  COUNT(*) FROM "Setting"
  WHERE "key" LIKE 'invoice.next.%' OR "key" LIKE 'creditnote.next.%';


-- =========================================================================
-- WIPE — run when the preview looks right.
-- =========================================================================

BEGIN;

-- Order graph — deepest leaves first to satisfy FKs.
-- (Most of these are ON DELETE CASCADE in the schema, but being explicit
-- makes the script auditable and safer if FK rules change later.)
DELETE FROM "CreditNoteItem";
DELETE FROM "CreditNote";
DELETE FROM "Invoice";
DELETE FROM "ReturnItem";
DELETE FROM "ReturnRequest";
DELETE FROM "OrderEvent";
DELETE FROM "OrderItem";
DELETE FROM "GiftCardRedemption";
DELETE FROM "GiftCard";
DELETE FROM "InventoryMovement";
DELETE FROM "LoyaltyEvent" WHERE "orderId" IS NOT NULL OR "returnId" IS NOT NULL;
DELETE FROM "AiConversation";  -- AiMessage cascades from AiConversation
DELETE FROM "Order";

-- Reset coupon usage tracking. Definitions (code, percent, cap) stay.
UPDATE "Coupon" SET "redemptionsUsed" = 0 WHERE "redemptionsUsed" > 0;

-- Loyalty: zero out balances (the rows stay, points/tiers go back to 0).
UPDATE "LoyaltyAccount"
   SET "pointsBalance" = 0,
       "pointsLifetime" = 0
   WHERE "pointsBalance" > 0 OR "pointsLifetime" > 0;

-- Carts: every session, including in-progress ones from real visitors.
-- (After launch they'll be recreated on the next visit. If you'd rather
-- preserve abandoned-cart emails about to fire, skip these two lines.)
DELETE FROM "CartItem";
DELETE FROM "Cart";

-- Quiz completions — quiz reward coupons reference orders, safer to wipe.
DELETE FROM "QuizCompletion";

-- Test reviews + wishlists.
DELETE FROM "Review";
DELETE FROM "WishlistItem";

-- Back-in-stock subscriptions — start clean.
DELETE FROM "BackInStockSubscription";

-- Live-visitors widget data — starts at 0 visitors.
DELETE FROM "VisitorPing";

-- Recurring product subscriptions from testing.
DELETE FROM "ProductSubscription";

-- Wipe the audit trail so the production log starts fresh.
DELETE FROM "AuditLog";

-- Invoice + Credit note number counters back to "next = 1".
-- After this, the FIRST real customer's invoice will be INV-2026-00001
-- and the first refund/cancellation CN will be CN-2026-00001.
DELETE FROM "Setting"
 WHERE "key" LIKE 'invoice.next.%'
    OR "key" LIKE 'creditnote.next.%';

COMMIT;


-- =========================================================================
-- OPTIONAL — also wipe test customer accounts
-- =========================================================================
-- Skip this block unless you want to wipe every non-admin user.
-- Adjust the email allow-list to keep specific accounts (yourself,
-- Sofia, any real customers who signed up early).
--
-- BEGIN;
-- DELETE FROM "User"
--  WHERE "role" <> 'ADMIN'
--    AND "email" NOT IN (
--      'maxim.sahnevich@gmail.com',
--      'yurskin.benelux@gmail.com'
--      -- add any other allow-listed emails here
--    );
-- COMMIT;


-- =========================================================================
-- AFTER SQL — clean up Supabase Storage
-- =========================================================================
-- The SQL above wipes the DB rows but the PDF files in Supabase Storage
-- (which the rows referenced) are now orphaned. Delete them manually:
--
--   1. Supabase Studio → Storage → invoices bucket
--   2. Open the 2026/ folder
--   3. Select all → Delete  (this drops every INV-2026-*.pdf)
--   4. Open the creditnotes/2026/ folder
--   5. Select all → Delete  (this drops every CN-2026-*.pdf)
--
-- Also worth checking:
--   • carts/  — abandoned cart payloads (if any large ones)
--   • The export-tmp/ prefix if your CSV exports landed there
--
-- =========================================================================
-- AFTER STORAGE — sanity checks
-- =========================================================================
-- Refresh /admin and confirm:
--   • Last 30 days revenue widget shows EUR 0.00
--   • Cross-border VAT YTD shows EUR 0.00
--   • Orders list is empty
--   • Returns list is empty
--   • Invoices list is empty (the page should show "No invoices yet")
--   • Credit notes list is empty
--   • Audit log shows only the wipe action itself (next admin action)
--
-- If all six are clean, the next real customer's order will be the first
-- entry in every report. INV-2026-00001 and CN-2026-00001 are reserved
-- and waiting.
