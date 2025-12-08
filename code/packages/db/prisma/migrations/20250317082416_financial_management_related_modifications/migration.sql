-- CreateEnum
CREATE TYPE "CancellationWindowType" AS ENUM ('FREE', 'PARTIAL', 'NO_REFUND');

-- AlterTable
ALTER TABLE "cancellation_requests" ADD COLUMN     "window_type" "CancellationWindowType" NOT NULL DEFAULT 'NO_REFUND';

-- CreateTable
CREATE TABLE "reservation_financial_data" (
    "financial_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "net_buffet_price" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "service_charge" DECIMAL(10,2) NOT NULL,
    "total_before_discount" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL,
    "total_after_discount" DECIMAL(10,2) NOT NULL,
    "advance_payment" DECIMAL(10,2) NOT NULL,
    "balance_due" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_financial_data_pkey" PRIMARY KEY ("financial_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_financial_data_reservation_id_key" ON "reservation_financial_data"("reservation_id");

-- AddForeignKey
ALTER TABLE "reservation_financial_data" ADD CONSTRAINT "reservation_financial_data_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;
