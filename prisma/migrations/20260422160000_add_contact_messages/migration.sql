-- Contact form: inbound messages from /[locale]/contact.
-- Source of truth for customer enquiries. Saved even if the Resend admin
-- notification fails, so Sofia never loses a customer message.
--
-- Status lifecycle: NEW → READ → REPLIED (happy path)
--                          └─→ ARCHIVED (hidden from default list)

CREATE TYPE "ContactSubject" AS ENUM (
  'GENERAL',
  'ORDER',
  'RETURN',
  'WHOLESALE',
  'TECHNICAL'
);

CREATE TYPE "ContactStatus" AS ENUM (
  'NEW',
  'READ',
  'REPLIED',
  'ARCHIVED'
);

CREATE TABLE "ContactMessage" (
  "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
  "locale"      "Locale"        NOT NULL DEFAULT 'EN',
  "name"        TEXT            NOT NULL,
  "email"       TEXT            NOT NULL,
  "phone"       TEXT,
  "subject"     "ContactSubject" NOT NULL DEFAULT 'GENERAL',
  "orderNumber" TEXT,
  "message"     TEXT            NOT NULL,
  "status"      "ContactStatus" NOT NULL DEFAULT 'NEW',
  "ipHash"      TEXT,
  "userAgent"   TEXT,
  "userId"      UUID,
  "notifiedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactMessage_status_createdAt_idx"
  ON "ContactMessage" ("status", "createdAt");

CREATE INDEX "ContactMessage_email_idx"
  ON "ContactMessage" ("email");

ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
