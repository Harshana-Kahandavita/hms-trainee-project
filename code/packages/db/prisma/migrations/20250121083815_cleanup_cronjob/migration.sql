-- CreateTable
CREATE TABLE "cleanup_logs" (
    "log_id" SERIAL NOT NULL,
    "cleanup_type" TEXT NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "records_removed" INTEGER NOT NULL,
    "cleanup_start_time" TIMESTAMP(3) NOT NULL,
    "cleanup_end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cleanup_logs_pkey" PRIMARY KEY ("log_id")
);

-- AddForeignKey
ALTER TABLE "cleanup_logs" ADD CONSTRAINT "cleanup_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
