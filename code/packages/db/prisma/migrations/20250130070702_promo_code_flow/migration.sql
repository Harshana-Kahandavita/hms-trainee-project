/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `customers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE_OFF', 'FIXED_AMOUNT_OFF');

-- AlterTable
ALTER TABLE "reservation_requests" ADD COLUMN     "estimated_discount_amount" DECIMAL(10,2),
ADD COLUMN     "promo_code_id" INTEGER;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "discount_amount" DECIMAL(10,2),
ADD COLUMN     "promo_code_id" INTEGER;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(65,30) NOT NULL,
    "minimumOrderValue" DECIMAL(65,30) NOT NULL,
    "maximumDiscountAmount" DECIMAL(65,30) NOT NULL,
    "usageLimitPerUser" INTEGER NOT NULL,
    "usageLimitTotal" INTEGER NOT NULL,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "partySizeLimit" INTEGER NOT NULL DEFAULT 100,
    "partySizeLimitPerUser" INTEGER NOT NULL DEFAULT 10,
    "partySizeUsed" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_restaurant_mappings" (
    "mapping_id" SERIAL NOT NULL,
    "promo_code_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_code_restaurant_mappings_pkey" PRIMARY KEY ("mapping_id")
);

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "promoCodeId" INTEGER NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "originalRequestId" INTEGER NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy" TEXT NOT NULL,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_idx" ON "PromoCodeUsage"("promoCodeId");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_reservationId_idx" ON "PromoCodeUsage"("reservationId");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_customerId_idx" ON "PromoCodeUsage"("customerId");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_originalRequestId_idx" ON "PromoCodeUsage"("originalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_restaurant_mappings" ADD CONSTRAINT "promo_code_restaurant_mappings_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_restaurant_mappings" ADD CONSTRAINT "promo_code_restaurant_mappings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_originalRequestId_fkey" FOREIGN KEY ("originalRequestId") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;
