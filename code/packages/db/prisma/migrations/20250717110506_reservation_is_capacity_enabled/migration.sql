/*
  Warnings:

  - A unique constraint covering the columns `[restaurant_id,service_id,date]` on the table `restaurant_capacity` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "restaurant_capacity" ADD COLUMN     "is_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_capacity_restaurant_id_service_id_date_key" ON "restaurant_capacity"("restaurant_id", "service_id", "date");
