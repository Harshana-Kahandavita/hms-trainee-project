-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('FAILED', 'RETRY_PENDING', 'RETRY_SUCCESS', 'RETRY_FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PortalType" AS ENUM ('MERCHANT', 'GUEST', 'ADMIN');

-- CreateTable
CREATE TABLE "failed_emails" (
    "failed_email_id" SERIAL NOT NULL,
    "reservation_id" INTEGER,
    "restaurant_id" INTEGER,
    "portal_type" "PortalType" NOT NULL,
    "email_type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template_data" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "EmailStatus" NOT NULL DEFAULT 'FAILED',
    "last_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failed_emails_pkey" PRIMARY KEY ("failed_email_id")
);

-- CreateIndex
CREATE INDEX "failed_emails_status_idx" ON "failed_emails"("status");

-- CreateIndex
CREATE INDEX "failed_emails_reservation_id_idx" ON "failed_emails"("reservation_id");

-- CreateIndex
CREATE INDEX "failed_emails_restaurant_id_idx" ON "failed_emails"("restaurant_id");

-- CreateIndex
CREATE INDEX "failed_emails_portal_type_idx" ON "failed_emails"("portal_type");
