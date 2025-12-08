/*
  Warnings:

  - A unique constraint covering the columns `[hero_image_id]` on the table `restaurants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "hero_image_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_hero_image_id_key" ON "restaurants"("hero_image_id");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_hero_image_id_fkey" FOREIGN KEY ("hero_image_id") REFERENCES "restaurant_images"("image_id") ON DELETE SET NULL ON UPDATE CASCADE;
