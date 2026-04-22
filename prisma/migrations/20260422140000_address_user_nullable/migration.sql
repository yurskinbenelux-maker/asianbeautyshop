-- Guest checkout: Address.userId becomes nullable.
-- Before: every address had to belong to a User (pre-guest-checkout era).
-- After:  guest checkouts create Address rows with userId = NULL; the
--         order's shippingAddressId / billingAddressId FKs still link.
-- When a guest later signs up with the same email, we can backfill the
-- userId on their orders' addresses in one UPDATE.

ALTER TABLE "Address" DROP CONSTRAINT "Address_userId_fkey";

ALTER TABLE "Address" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "Address"
  ADD CONSTRAINT "Address_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
