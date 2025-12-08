/*
  Warnings:

  - You are about to drop the column `adult_price` on the `restaurant_meal_services` table. All the data in the column will be lost.
  - You are about to drop the column `child_price` on the `restaurant_meal_services` table. All the data in the column will be lost.
  - Added the required column `adult_gross_price` to the `restaurant_meal_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adult_net_price` to the `restaurant_meal_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `child_gross_price` to the `restaurant_meal_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `child_net_price` to the `restaurant_meal_services` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "restaurant_meal_services" DROP COLUMN "adult_price",
DROP COLUMN "child_price",
ADD COLUMN     "adult_gross_price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "adult_net_price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "child_gross_price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "child_net_price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "is_child_enabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "service_charge_percentage" SET DEFAULT 0.00,
ALTER COLUMN "tax_percentage" SET DEFAULT 0.00;
