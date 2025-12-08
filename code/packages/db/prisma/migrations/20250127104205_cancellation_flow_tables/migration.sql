-- CreateEnum
CREATE TYPE "CancellationRequestedBy" AS ENUM ('CUSTOMER', 'MERCHANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED_PENDING_REFUND', 'APPROVED_REFUNDED', 'APPROVED_NO_REFUND', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationReasonCategory" AS ENUM ('CHANGE_OF_PLANS', 'EMERGENCY', 'WEATHER', 'RESTAURANT_ISSUE', 'DOUBLE_BOOKING', 'SYSTEM_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('RESERVATION_CANCELLATION', 'PAX_MODIFICATION', 'SPECIAL_CIRCUMSTANCE', 'CUSTOMER_COMPLAINT', 'MERCHANT_INITIATED', 'SYSTEM_ERROR');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "cancellation_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "requestedBy" "CancellationRequestedBy" NOT NULL,
    "requested_by_id" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CancellationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reason" TEXT NOT NULL,
    "reasonCategory" "CancellationReasonCategory" NOT NULL,
    "additional_notes" TEXT,
    "processed_at" TIMESTAMP(3),
    "processed_by" TEXT,
    "refund_amount" DECIMAL(10,2),
    "refund_percentage" INTEGER,
    "refund_notes" TEXT,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("cancellation_id")
);

-- CreateTable
CREATE TABLE "restaurant_refund_policies" (
    "policy_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "allowed_refund_types" "RefundType"[],
    "full_refund_before_minutes" INTEGER NOT NULL,
    "partial_refund_before_minutes" INTEGER,
    "partial_refund_percentage" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "restaurant_refund_policies_pkey" PRIMARY KEY ("policy_id")
);

-- CreateTable
CREATE TABLE "refund_transactions" (
    "refund_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "cancellation_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "processed_at" TIMESTAMP(3),
    "processed_by" TEXT,
    "transaction_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_transactions_pkey" PRIMARY KEY ("refund_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_refund_policies_restaurant_id_meal_type_key" ON "restaurant_refund_policies"("restaurant_id", "meal_type");

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_refund_policies" ADD CONSTRAINT "restaurant_refund_policies_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "cancellation_requests"("cancellation_id") ON DELETE SET NULL ON UPDATE CASCADE;
