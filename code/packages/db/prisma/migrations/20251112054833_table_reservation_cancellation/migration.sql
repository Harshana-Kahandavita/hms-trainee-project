-- AlterTable
ALTER TABLE "cancellation_requests" ADD COLUMN     "merged_table_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "released_slot_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "slot_release_completed_at" TIMESTAMP(3),
ADD COLUMN     "table_set_id" INTEGER;

-- AlterTable
ALTER TABLE "reservation_business_policies" ADD COLUMN     "is_refund_allowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "idx_cancellation_requests_table_set_id" ON "cancellation_requests"("table_set_id");

-- CreateIndex
CREATE INDEX "idx_cancellation_requests_slot_release_completed" ON "cancellation_requests"("slot_release_completed_at");

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_table_set_id_fkey" FOREIGN KEY ("table_set_id") REFERENCES "table_sets"("set_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "reservation_business_policies_restaurant_id_is_active_idx" RENAME TO "idx_reservation_business_policies_lookup";
