-- CreateEnum
CREATE TYPE "TableModificationType" AS ENUM ('PARTY_SIZE', 'SECTION_ASSIGNMENT', 'TABLE_ASSIGNMENT', 'TIME_SLOT', 'SPECIAL_REQUESTS', 'BOTH', 'OTHER');

-- CreateEnum
CREATE TYPE "TableModificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "table_reservation_modification_requests" (
    "modification_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "requested_by" TEXT NOT NULL,
    "modification_types" "TableModificationType"[],
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TableModificationStatus" NOT NULL DEFAULT 'PENDING',
    "original_adult_count" INTEGER NOT NULL,
    "original_child_count" INTEGER NOT NULL,
    "original_section_id" INTEGER,
    "original_table_id" INTEGER,
    "original_slot_id" INTEGER,
    "original_table_start_time" TIMESTAMP(3),
    "original_table_end_time" TIMESTAMP(3),
    "original_special_requests" TEXT,
    "new_adult_count" INTEGER,
    "new_child_count" INTEGER,
    "new_section_id" INTEGER,
    "new_table_id" INTEGER,
    "new_slot_id" INTEGER,
    "new_table_start_time" TIMESTAMP(3),
    "new_table_end_time" TIMESTAMP(3),
    "new_special_requests" TEXT,
    "processed_at" TIMESTAMP(3),
    "processed_by" TEXT,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "original_slot_released" BOOLEAN NOT NULL DEFAULT false,
    "new_slot_reserved" BOOLEAN NOT NULL DEFAULT false,
    "slot_adjusted_at" TIMESTAMP(3),

    CONSTRAINT "table_reservation_modification_requests_pkey" PRIMARY KEY ("modification_id")
);

-- CreateTable
CREATE TABLE "table_reservation_modification_status_history" (
    "history_id" SERIAL NOT NULL,
    "modification_id" INTEGER NOT NULL,
    "previous_status" "TableModificationStatus",
    "new_status" "TableModificationStatus" NOT NULL,
    "change_reason" TEXT NOT NULL,
    "status_changed_at" TIMESTAMP(3) NOT NULL,
    "changed_by" TEXT NOT NULL,

    CONSTRAINT "table_reservation_modification_status_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "table_reservation_modification_history" (
    "history_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "modification_id" INTEGER NOT NULL,
    "previous_adult_count" INTEGER NOT NULL,
    "previous_child_count" INTEGER NOT NULL,
    "previous_section_id" INTEGER,
    "previous_table_id" INTEGER,
    "previous_slot_id" INTEGER,
    "previous_table_start_time" TIMESTAMP(3),
    "previous_table_end_time" TIMESTAMP(3),
    "previous_special_requests" TEXT,
    "new_adult_count" INTEGER NOT NULL,
    "new_child_count" INTEGER NOT NULL,
    "new_section_id" INTEGER,
    "new_table_id" INTEGER,
    "new_slot_id" INTEGER,
    "new_table_start_time" TIMESTAMP(3),
    "new_table_end_time" TIMESTAMP(3),
    "new_special_requests" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT NOT NULL,

    CONSTRAINT "table_reservation_modification_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateIndex
CREATE INDEX "table_reservation_modification_requests_reservation_id_idx" ON "table_reservation_modification_requests"("reservation_id");

-- CreateIndex
CREATE INDEX "table_reservation_modification_requests_restaurant_id_idx" ON "table_reservation_modification_requests"("restaurant_id");

-- CreateIndex
CREATE INDEX "table_reservation_modification_requests_status_idx" ON "table_reservation_modification_requests"("status");

-- AddForeignKey
ALTER TABLE "table_reservation_modification_requests" ADD CONSTRAINT "table_reservation_modification_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservation_modification_requests" ADD CONSTRAINT "table_reservation_modification_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservation_modification_status_history" ADD CONSTRAINT "table_reservation_modification_status_history_modification_fkey" FOREIGN KEY ("modification_id") REFERENCES "table_reservation_modification_requests"("modification_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservation_modification_history" ADD CONSTRAINT "table_reservation_modification_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservation_modification_history" ADD CONSTRAINT "table_reservation_modification_history_modification_id_fkey" FOREIGN KEY ("modification_id") REFERENCES "table_reservation_modification_requests"("modification_id") ON DELETE RESTRICT ON UPDATE CASCADE;
