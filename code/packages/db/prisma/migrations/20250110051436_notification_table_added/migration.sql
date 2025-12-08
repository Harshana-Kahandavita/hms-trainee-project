-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RESERVATION_REQUEST', 'RESERVATION_CONFIRMED', 'RESERVATION_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'REVIEW_POSTED', 'SYSTEM_ALERT');

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_on" TIMESTAMP(3),
    "read_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE INDEX "notifications_restaurant_id_idx" ON "notifications"("restaurant_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
