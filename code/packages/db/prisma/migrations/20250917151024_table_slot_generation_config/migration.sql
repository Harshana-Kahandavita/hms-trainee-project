-- CreateTable
CREATE TABLE "table_slot_generation_configs" (
    "config_id" SERIAL NOT NULL,
    "table_reservation_config_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TIME NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "turnover_buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "advance_booking_days" INTEGER NOT NULL DEFAULT 30,
    "enabled_days" "DayOfWeek"[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::"DayOfWeek"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "table_slot_generation_configs_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "_TableSlotGenerationConfigTables" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TableSlotGenerationConfigTables_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "table_slot_generation_configs_table_reservation_config_id_key" ON "table_slot_generation_configs"("table_reservation_config_id");

-- CreateIndex
CREATE INDEX "_TableSlotGenerationConfigTables_B_index" ON "_TableSlotGenerationConfigTables"("B");

-- AddForeignKey
ALTER TABLE "table_slot_generation_configs" ADD CONSTRAINT "table_slot_generation_configs_table_reservation_config_id_fkey" FOREIGN KEY ("table_reservation_config_id") REFERENCES "table_reservation_utils_configuration"("config_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TableSlotGenerationConfigTables" ADD CONSTRAINT "_TableSlotGenerationConfigTables_A_fkey" FOREIGN KEY ("A") REFERENCES "restaurant_tables"("table_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TableSlotGenerationConfigTables" ADD CONSTRAINT "_TableSlotGenerationConfigTables_B_fkey" FOREIGN KEY ("B") REFERENCES "table_slot_generation_configs"("config_id") ON DELETE CASCADE ON UPDATE CASCADE;
