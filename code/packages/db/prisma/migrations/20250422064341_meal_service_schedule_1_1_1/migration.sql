-- CreateTable
CREATE TABLE "restaurant_meal_service_schedules" (
    "schedule_id" SERIAL NOT NULL,
    "meal_service_id" INTEGER NOT NULL,
    "available_days" "DayOfWeek"[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::"DayOfWeek"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_meal_service_schedules_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_meal_service_schedules_meal_service_id_key" ON "restaurant_meal_service_schedules"("meal_service_id");

-- AddForeignKey
ALTER TABLE "restaurant_meal_service_schedules" ADD CONSTRAINT "restaurant_meal_service_schedules_meal_service_id_fkey" FOREIGN KEY ("meal_service_id") REFERENCES "restaurant_meal_services"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE;
