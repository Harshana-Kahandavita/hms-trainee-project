-- CreateTable
CREATE TABLE "promo_code_customer_mappings" (
    "mapping_id" SERIAL NOT NULL,
    "promo_code_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_code_customer_mappings_pkey" PRIMARY KEY ("mapping_id")
);

-- AddForeignKey
ALTER TABLE "promo_code_customer_mappings" ADD CONSTRAINT "promo_code_customer_mappings_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_customer_mappings" ADD CONSTRAINT "promo_code_customer_mappings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
