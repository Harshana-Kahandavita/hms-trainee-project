-- CreateTable
CREATE TABLE "reservation_business_policies" (
    "policy_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "requires_payment" BOOLEAN NOT NULL DEFAULT false,
    "payment_type" "FeeType",
    "payment_value" DECIMAL(10,2),
    "payment_handled_by_options" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_visible_customer_portal" BOOLEAN NOT NULL DEFAULT true,
    "is_included_confirmation_email" BOOLEAN NOT NULL DEFAULT false,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "party_size_min" INTEGER,
    "party_size_max" INTEGER,
    "applicable_days" "DayOfWeek"[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::"DayOfWeek"[],
    "time_interval_start" TIME,
    "time_interval_end" TIME,
    "applicable_section_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "applicable_meal_types" "MealType"[] DEFAULT ARRAY[]::"MealType"[],
    "applicable_reservation_types" "ReservationType"[] DEFAULT ARRAY['TABLE_ONLY']::"ReservationType"[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "skip_text" TEXT,
    "user_selection_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "reservation_business_policies_pkey" PRIMARY KEY ("policy_id")
);

-- CreateTable
CREATE TABLE "reservation_policy_options" (
    "option_id" SERIAL NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "option_name" TEXT NOT NULL,
    "description" TEXT,
    "additional_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "additional_price_type" "FeeType" NOT NULL DEFAULT 'FIXED',
    "requires_payment" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "applicable_days" "DayOfWeek"[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::"DayOfWeek"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_policy_options_pkey" PRIMARY KEY ("option_id")
);

-- CreateTable
CREATE TABLE "reservation_applied_policies" (
    "applied_policy_id" SERIAL NOT NULL,
    "reservation_id" INTEGER,
    "request_id" INTEGER NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "selected_option_id" INTEGER,
    "was_accepted" BOOLEAN NOT NULL DEFAULT false,
    "was_skipped" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_applied_policies_pkey" PRIMARY KEY ("applied_policy_id")
);

-- CreateIndex
CREATE INDEX "reservation_business_policies_restaurant_id_is_active_idx" ON "reservation_business_policies"("restaurant_id", "is_active");

-- CreateIndex
CREATE INDEX "reservation_business_policies_priority_idx" ON "reservation_business_policies"("priority");

-- CreateIndex
CREATE INDEX "reservation_policy_options_policy_id_idx" ON "reservation_policy_options"("policy_id");

-- CreateIndex
CREATE INDEX "reservation_applied_policies_reservation_id_idx" ON "reservation_applied_policies"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_applied_policies_request_id_idx" ON "reservation_applied_policies"("request_id");

-- CreateIndex
CREATE INDEX "reservation_applied_policies_policy_id_idx" ON "reservation_applied_policies"("policy_id");

-- CreateIndex
CREATE INDEX "reservation_applied_policies_selected_option_id_idx" ON "reservation_applied_policies"("selected_option_id");

-- AddForeignKey
ALTER TABLE "reservation_business_policies" ADD CONSTRAINT "reservation_business_policies_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_policy_options" ADD CONSTRAINT "reservation_policy_options_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "reservation_business_policies"("policy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_applied_policies" ADD CONSTRAINT "reservation_applied_policies_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_applied_policies" ADD CONSTRAINT "reservation_applied_policies_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_applied_policies" ADD CONSTRAINT "reservation_applied_policies_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "reservation_business_policies"("policy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_applied_policies" ADD CONSTRAINT "reservation_applied_policies_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "reservation_policy_options"("option_id") ON DELETE SET NULL ON UPDATE CASCADE;
