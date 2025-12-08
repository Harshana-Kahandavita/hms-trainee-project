-- CreateTable
CREATE TABLE "favorite_restaurants" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "restaurant_id" INTEGER,
    "external_restaurant_id" TEXT,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorite_restaurants_user_id_idx" ON "favorite_restaurants"("user_id");

-- CreateIndex
CREATE INDEX "favorite_restaurants_restaurant_id_idx" ON "favorite_restaurants"("restaurant_id");

-- CreateIndex
CREATE INDEX "favorite_restaurants_external_restaurant_id_idx" ON "favorite_restaurants"("external_restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_restaurants_user_id_restaurant_id_external_restaur_key" ON "favorite_restaurants"("user_id", "restaurant_id", "external_restaurant_id");
