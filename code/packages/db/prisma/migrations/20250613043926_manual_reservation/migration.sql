/*
  Warnings:

  - The `created_by` column on the `reservation_requests` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `created_by` column on the `reservations` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RequestCreatorType" AS ENUM ('CUSTOMER', 'MERCHANT', 'SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationRequestStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ReservationRequestStatus" ADD VALUE 'REJECTED';
ALTER TYPE "ReservationRequestStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "ReservationRequestStatus" ADD VALUE 'MERCHANT_INITIATED';
ALTER TYPE "ReservationRequestStatus" ADD VALUE 'PENDING_CUSTOMER_PAYMENT';
ALTER TYPE "ReservationRequestStatus" ADD VALUE 'PAYMENT_LINK_EXPIRED';

-- AlterTable
ALTER TABLE "reservation_requests" ADD COLUMN     "requires_advance_payment" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" "RequestCreatorType" NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "created_by",
ADD COLUMN     "created_by" "RequestCreatorType" NOT NULL DEFAULT 'CUSTOMER';

-- CreateTable
CREATE TABLE "restaurant_payment_links" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_payment_links_request_id_key" ON "restaurant_payment_links"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_payment_links_token_key" ON "restaurant_payment_links"("token");

-- AddForeignKey
ALTER TABLE "restaurant_payment_links" ADD CONSTRAINT "restaurant_payment_links_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;
