/*
  Warnings:

  - A unique constraint covering the columns `[modification_request_id]` on the table `refund_transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[last_modification_id]` on the table `reservations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ModificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModificationType" AS ENUM ('DATE_TIME', 'PARTY_SIZE', 'MEAL_TYPE', 'BOTH', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RESERVATION_MODIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'MODIFICATION_REQUESTED';

-- AlterEnum
ALTER TYPE "RefundReason" ADD VALUE 'RESERVATION_MODIFICATION';

-- AlterTable
ALTER TABLE "refund_transactions" ADD COLUMN     "modification_request_id" INTEGER;

-- AlterTable
ALTER TABLE "reservation_payments" ADD COLUMN     "modification_id" INTEGER,
ADD COLUMN     "payment_type" TEXT NOT NULL DEFAULT 'RESERVATION';

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "advance_payment_amount" DECIMAL(10,2),
ADD COLUMN     "last_modification_id" INTEGER,
ADD COLUMN     "last_modified_at" TIMESTAMP(3),
ADD COLUMN     "last_modified_by" TEXT,
ADD COLUMN     "remaining_payment_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "reservation_modification_requests" (
    "modification_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "requested_by" TEXT NOT NULL,
    "modification_types" "ModificationType"[],
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ModificationStatus" NOT NULL DEFAULT 'PENDING',
    "original_date" DATE NOT NULL,
    "original_time" TIME NOT NULL,
    "original_adult_count" INTEGER NOT NULL,
    "original_child_count" INTEGER NOT NULL,
    "original_meal_type" "MealType" NOT NULL,
    "original_amount" DECIMAL(10,2) NOT NULL,
    "original_service_charge" DECIMAL(10,2) NOT NULL,
    "original_tax_amount" DECIMAL(10,2) NOT NULL,
    "original_advance_payment_amount" DECIMAL(10,2),
    "original_remaining_payment_amount" DECIMAL(10,2),
    "original_promo_code_id" INTEGER,
    "original_discount_amount" DECIMAL(10,2),
    "new_date" DATE,
    "new_time" TIME,
    "new_adult_count" INTEGER,
    "new_child_count" INTEGER,
    "new_meal_type" "MealType",
    "new_amount" DECIMAL(10,2),
    "new_service_charge" DECIMAL(10,2),
    "new_tax_amount" DECIMAL(10,2),
    "new_discount_amount" DECIMAL(10,2),
    "new_advance_payment_amount" DECIMAL(10,2),
    "new_remaining_payment_amount" DECIMAL(10,2),
    "price_difference" DECIMAL(10,2),
    "additional_payment_required" BOOLEAN NOT NULL DEFAULT false,
    "refund_required" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "processed_by" TEXT,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "promo_code_reapplied" BOOLEAN,
    "promo_code_adjustment_notes" TEXT,
    "seats_released" INTEGER,
    "seats_reserved" INTEGER,
    "capacity_adjusted_at" TIMESTAMP(3),

    CONSTRAINT "reservation_modification_requests_pkey" PRIMARY KEY ("modification_id")
);

-- CreateTable
CREATE TABLE "reservation_modification_status_history" (
    "history_id" SERIAL NOT NULL,
    "modification_id" INTEGER NOT NULL,
    "previous_status" "ModificationStatus",
    "new_status" "ModificationStatus" NOT NULL,
    "change_reason" TEXT NOT NULL,
    "status_changed_at" TIMESTAMP(3) NOT NULL,
    "changed_by" TEXT NOT NULL,

    CONSTRAINT "reservation_modification_status_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "reservation_modification_history" (
    "history_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "modification_id" INTEGER NOT NULL,
    "previous_date" DATE NOT NULL,
    "previous_time" TIME NOT NULL,
    "previous_adult_count" INTEGER NOT NULL,
    "previous_child_count" INTEGER NOT NULL,
    "previous_meal_type" "MealType" NOT NULL,
    "previous_amount" DECIMAL(10,2) NOT NULL,
    "previous_service_charge" DECIMAL(10,2) NOT NULL,
    "previous_tax_amount" DECIMAL(10,2) NOT NULL,
    "previous_discount_amount" DECIMAL(10,2),
    "previous_advance_payment_amount" DECIMAL(10,2),
    "previous_remaining_payment_amount" DECIMAL(10,2),
    "new_date" DATE NOT NULL,
    "new_time" TIME NOT NULL,
    "new_adult_count" INTEGER NOT NULL,
    "new_child_count" INTEGER NOT NULL,
    "new_meal_type" "MealType" NOT NULL,
    "new_amount" DECIMAL(10,2) NOT NULL,
    "new_service_charge" DECIMAL(10,2) NOT NULL,
    "new_tax_amount" DECIMAL(10,2) NOT NULL,
    "new_discount_amount" DECIMAL(10,2),
    "new_advance_payment_amount" DECIMAL(10,2),
    "new_remaining_payment_amount" DECIMAL(10,2),
    "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT NOT NULL,

    CONSTRAINT "reservation_modification_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateIndex
CREATE INDEX "reservation_modification_requests_reservation_id_idx" ON "reservation_modification_requests"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_modification_requests_restaurant_id_idx" ON "reservation_modification_requests"("restaurant_id");

-- CreateIndex
CREATE INDEX "reservation_modification_requests_status_idx" ON "reservation_modification_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refund_transactions_modification_request_id_key" ON "refund_transactions"("modification_request_id");

-- CreateIndex
CREATE INDEX "reservation_payments_modification_id_idx" ON "reservation_payments"("modification_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_last_modification_id_key" ON "reservations"("last_modification_id");

-- AddForeignKey
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_modification_id_fkey" FOREIGN KEY ("modification_id") REFERENCES "reservation_modification_requests"("modification_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_modification_request_id_fkey" FOREIGN KEY ("modification_request_id") REFERENCES "reservation_modification_requests"("modification_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_requests" ADD CONSTRAINT "reservation_modification_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_requests" ADD CONSTRAINT "reservation_modification_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_requests" ADD CONSTRAINT "reservation_modification_requests_original_promo_code_id_fkey" FOREIGN KEY ("original_promo_code_id") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_status_history" ADD CONSTRAINT "reservation_modification_status_history_modification_id_fkey" FOREIGN KEY ("modification_id") REFERENCES "reservation_modification_requests"("modification_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_history" ADD CONSTRAINT "reservation_modification_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_modification_history" ADD CONSTRAINT "reservation_modification_history_modification_id_fkey" FOREIGN KEY ("modification_id") REFERENCES "reservation_modification_requests"("modification_id") ON DELETE RESTRICT ON UPDATE CASCADE;
