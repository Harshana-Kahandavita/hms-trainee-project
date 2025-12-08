-- CreateEnum
CREATE TYPE "TableSetStatus" AS ENUM ('PENDING_MERGE', 'ACTIVE', 'DISSOLVED', 'EXPIRED');

-- CreateTable
CREATE TABLE "table_sets" (
    "set_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "slot_date" DATE NOT NULL,
    "slot_start_time" TIME NOT NULL,
    "slot_end_time" TIME NOT NULL,
    "table_ids" INTEGER[],
    "slot_ids" INTEGER[],
    "primary_table_id" INTEGER NOT NULL,
    "original_statuses" JSONB NOT NULL,
    "status" "TableSetStatus" NOT NULL DEFAULT 'PENDING_MERGE',
    "combined_capacity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "dissolved_at" TIMESTAMP(3),
    "dissolved_by" TEXT,

    CONSTRAINT "table_sets_pkey" PRIMARY KEY ("set_id")
);

-- CreateIndex
CREATE INDEX "table_sets_reservation_id_status_idx" ON "table_sets"("reservation_id", "status");

-- CreateIndex
CREATE INDEX "table_sets_expires_at_idx" ON "table_sets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "table_sets_reservation_id_slot_date_slot_start_time_key" ON "table_sets"("reservation_id", "slot_date", "slot_start_time");

-- AddForeignKey
ALTER TABLE "table_sets" ADD CONSTRAINT "table_sets_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE;
