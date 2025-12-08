-- AlterTable
ALTER TABLE "reservation_requests" ADD COLUMN     "meal_service_id" INTEGER;

-- AlterTable
ALTER TABLE "restaurant_meal_services" ADD COLUMN     "is_legacy_pricing" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "restaurant_platters" (
    "platter_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "meal_service_id" INTEGER NOT NULL,
    "platter_name" VARCHAR(100) NOT NULL,
    "platter_description" TEXT,
    "head_count" INTEGER NOT NULL,
    "adult_gross_price" DECIMAL(10,2) NOT NULL,
    "child_gross_price" DECIMAL(10,2) NOT NULL,
    "adult_net_price" DECIMAL(10,2) NOT NULL,
    "child_net_price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,
    "images" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL,
    "updated_by" VARCHAR(50) NOT NULL,

    CONSTRAINT "restaurant_platters_pkey" PRIMARY KEY ("platter_id")
);

-- CreateIndex
CREATE INDEX "restaurant_platters_restaurant_id_meal_service_id_idx" ON "restaurant_platters"("restaurant_id", "meal_service_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_platters_restaurant_id_meal_service_id_platter_n_key" ON "restaurant_platters"("restaurant_id", "meal_service_id", "platter_name");

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_meal_service_id_fkey" FOREIGN KEY ("meal_service_id") REFERENCES "restaurant_meal_services"("service_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_platters" ADD CONSTRAINT "restaurant_platters_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_platters" ADD CONSTRAINT "restaurant_platters_meal_service_id_fkey" FOREIGN KEY ("meal_service_id") REFERENCES "restaurant_meal_services"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE;
