-- CreateEnum
CREATE TYPE "ReservationSupportType" AS ENUM ('BUFFET_ONLY', 'TABLE_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('BUFFET_ONLY', 'TABLE_ONLY', 'BUFFET_AND_TABLE');

-- CreateEnum
CREATE TYPE "TableSlotStatus" AS ENUM ('AVAILABLE', 'HELD', 'RESERVED', 'BLOCKED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "reservation_requests" ADD COLUMN     "reservation_type" "ReservationType" NOT NULL DEFAULT 'BUFFET_ONLY';

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "reservation_type" "ReservationType" NOT NULL DEFAULT 'BUFFET_ONLY';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "reservation_support" "ReservationSupportType" NOT NULL DEFAULT 'BUFFET_ONLY';

-- CreateTable
CREATE TABLE "restaurant_sections" (
    "section_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "section_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_sections_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "table_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "section_id" INTEGER NOT NULL,
    "table_name" TEXT NOT NULL,
    "seating_capacity" INTEGER NOT NULL,
    "table_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" JSONB,
    "amenities" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("table_id")
);

-- CreateTable
CREATE TABLE "table_availability_slots" (
    "slot_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "table_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "status" "TableSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reservation_id" INTEGER,
    "hold_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_availability_slots_pkey" PRIMARY KEY ("slot_id")
);

-- CreateTable
CREATE TABLE "table_reservation_utils_configuration" (
    "config_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER,
    "fee_type" "FeeType" NOT NULL,
    "fee_value" DECIMAL(10,2) NOT NULL,
    "requires_advance_payment" BOOLEAN NOT NULL DEFAULT true,
    "advance_payment_type" "FeeType",
    "advance_payment_value" DECIMAL(10,2),
    "default_slot_minutes" INTEGER NOT NULL DEFAULT 90,
    "turnover_buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "enable_temporary_hold" BOOLEAN NOT NULL DEFAULT true,
    "hold_minutes" INTEGER NOT NULL DEFAULT 10,
    "allow_flexible_assignment" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_reservation_utils_configuration_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "reservation_request_table_details" (
    "request_id" INTEGER NOT NULL,
    "preferred_section_id" INTEGER,
    "preferred_table_id" INTEGER,
    "preferred_time_slot_start" TIMESTAMP(3),
    "preferred_time_slot_end" TIMESTAMP(3),
    "is_flexible_with_table" BOOLEAN NOT NULL DEFAULT true,
    "is_flexible_with_section" BOOLEAN NOT NULL DEFAULT true,
    "is_flexible_with_time" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_request_table_details_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "reservation_table_assignments" (
    "reservation_id" INTEGER NOT NULL,
    "assigned_section_id" INTEGER,
    "assigned_table_id" INTEGER,
    "slot_id" INTEGER,
    "table_start_time" TIMESTAMP(3),
    "table_end_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_table_assignments_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "reservation_table_holds" (
    "hold_id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "hold_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_table_holds_pkey" PRIMARY KEY ("hold_id")
);

-- CreateIndex
CREATE INDEX "restaurant_sections_restaurant_id_idx" ON "restaurant_sections"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_tables_restaurant_id_section_id_is_active_idx" ON "restaurant_tables"("restaurant_id", "section_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_table_name_key" ON "restaurant_tables"("restaurant_id", "table_name");

-- CreateIndex
CREATE INDEX "table_availability_slots_restaurant_id_date_status_idx" ON "table_availability_slots"("restaurant_id", "date", "status");

-- CreateIndex
CREATE INDEX "table_availability_slots_hold_expires_at_idx" ON "table_availability_slots"("hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "table_availability_slots_table_id_date_start_time_end_time_key" ON "table_availability_slots"("table_id", "date", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "table_reservation_utils_configuration_restaurant_id_idx" ON "table_reservation_utils_configuration"("restaurant_id");

-- CreateIndex
CREATE INDEX "reservation_request_table_details_preferred_section_id_idx" ON "reservation_request_table_details"("preferred_section_id");

-- CreateIndex
CREATE INDEX "reservation_request_table_details_preferred_table_id_idx" ON "reservation_request_table_details"("preferred_table_id");

-- CreateIndex
CREATE INDEX "reservation_request_table_details_preferred_time_slot_start_idx" ON "reservation_request_table_details"("preferred_time_slot_start", "preferred_time_slot_end");

-- CreateIndex
CREATE INDEX "reservation_table_assignments_assigned_table_id_idx" ON "reservation_table_assignments"("assigned_table_id");

-- CreateIndex
CREATE INDEX "reservation_table_assignments_slot_id_idx" ON "reservation_table_assignments"("slot_id");

-- CreateIndex
CREATE INDEX "reservation_table_holds_hold_expires_at_idx" ON "reservation_table_holds"("hold_expires_at");

-- CreateIndex
CREATE INDEX "reservation_table_holds_request_id_idx" ON "reservation_table_holds"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_table_holds_slot_id_key" ON "reservation_table_holds"("slot_id");

-- AddForeignKey
ALTER TABLE "restaurant_sections" ADD CONSTRAINT "restaurant_sections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "restaurant_sections"("section_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_availability_slots" ADD CONSTRAINT "table_availability_slots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_availability_slots" ADD CONSTRAINT "table_availability_slots_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("table_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_availability_slots" ADD CONSTRAINT "table_availability_slots_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservation_utils_configuration" ADD CONSTRAINT "table_reservation_utils_configuration_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_table_details" ADD CONSTRAINT "reservation_request_table_details_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_table_details" ADD CONSTRAINT "reservation_request_table_details_preferred_section_id_fkey" FOREIGN KEY ("preferred_section_id") REFERENCES "restaurant_sections"("section_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_table_details" ADD CONSTRAINT "reservation_request_table_details_preferred_table_id_fkey" FOREIGN KEY ("preferred_table_id") REFERENCES "restaurant_tables"("table_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_assigned_section_id_fkey" FOREIGN KEY ("assigned_section_id") REFERENCES "restaurant_sections"("section_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_assigned_table_id_fkey" FOREIGN KEY ("assigned_table_id") REFERENCES "restaurant_tables"("table_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "table_availability_slots"("slot_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_holds" ADD CONSTRAINT "reservation_table_holds_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_table_holds" ADD CONSTRAINT "reservation_table_holds_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "table_availability_slots"("slot_id") ON DELETE RESTRICT ON UPDATE CASCADE;
