/*
  Warnings:

  - You are about to drop the column `ambiance_rating` on the `reservation_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `food_rating` on the `reservation_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `overall_rating` on the `reservation_reviews` table. All the data in the column will be lost.
  - Added the required column `meal_rating` to the `reservation_reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `platform_rating` to the `reservation_reviews` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "reservation_reviews" DROP COLUMN "ambiance_rating",
DROP COLUMN "food_rating",
DROP COLUMN "overall_rating",
ADD COLUMN     "meal_rating" INTEGER NOT NULL,
ADD COLUMN     "platform_rating" INTEGER NOT NULL,
ALTER COLUMN "review_text" DROP NOT NULL;

-- CreateTable
CREATE TABLE "restaurant_review_stats" (
    "stats_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "avg_service_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "avg_meal_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "avg_platform_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "service_rating_1_count" INTEGER NOT NULL DEFAULT 0,
    "service_rating_2_count" INTEGER NOT NULL DEFAULT 0,
    "service_rating_3_count" INTEGER NOT NULL DEFAULT 0,
    "service_rating_4_count" INTEGER NOT NULL DEFAULT 0,
    "service_rating_5_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_review_stats_pkey" PRIMARY KEY ("stats_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_review_stats_restaurant_id_key" ON "restaurant_review_stats"("restaurant_id");

-- AddForeignKey
ALTER TABLE "restaurant_review_stats" ADD CONSTRAINT "restaurant_review_stats_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
