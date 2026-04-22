-- ─────────────────────────────────────────────────────────────────────────
-- SiteCopy + Testimonial models
--   • SiteCopy: admin-editable (section, field, locale) → value strings that
--     override messages/{locale}.json for homepage + editorial surfaces.
--   • Testimonial + TestimonialTranslation: curated homepage quotes, per-locale
--     rewrites, with sort order + active toggle.
-- ─────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "SiteCopy" (
    "id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "SiteCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCopy_section_locale_idx" ON "SiteCopy"("section", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCopy_section_field_locale_key" ON "SiteCopy"("section", "field", "locale");

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testimonial_isActive_sortOrder_idx" ON "Testimonial"("isActive", "sortOrder");

-- CreateTable
CREATE TABLE "TestimonialTranslation" (
    "id" UUID NOT NULL,
    "testimonialId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "quote" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "productName" TEXT,

    CONSTRAINT "TestimonialTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestimonialTranslation_testimonialId_locale_key" ON "TestimonialTranslation"("testimonialId", "locale");

-- AddForeignKey
ALTER TABLE "TestimonialTranslation" ADD CONSTRAINT "TestimonialTranslation_testimonialId_fkey" FOREIGN KEY ("testimonialId") REFERENCES "Testimonial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
