-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'BRUNCH', 'LUNCH', 'DINNER', 'SPECIAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SLOTS_NOT_AVAILABLE', 'TIMEOUT', 'PAYMENT_FAILED', 'MEAL_SERVICE_NOT_AVAILABLE', 'ERROR');

-- CreateTable
CREATE TABLE "business" (
    "business_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "tax_id" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("business_id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "restaurant_id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "location_id" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "online_quota" INTEGER NOT NULL,
    "thumbnail_image_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "advance_payment_percentage" INTEGER NOT NULL DEFAULT 35,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("restaurant_id")
);

-- CreateTable
CREATE TABLE "locations" (
    "location_id" SERIAL NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "cuisines" (
    "cuisine_id" SERIAL NOT NULL,
    "cuisine_name" TEXT NOT NULL,

    CONSTRAINT "cuisines_pkey" PRIMARY KEY ("cuisine_id")
);

-- CreateTable
CREATE TABLE "restaurant_cuisines" (
    "restaurant_id" INTEGER NOT NULL,
    "cuisine_id" INTEGER NOT NULL,

    CONSTRAINT "restaurant_cuisines_pkey" PRIMARY KEY ("restaurant_id","cuisine_id")
);

-- CreateTable
CREATE TABLE "restaurant_operating_hours" (
    "restaurant_id" INTEGER NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER NOT NULL,
    "online_quota" INTEGER NOT NULL,
    "opening_time" TIME NOT NULL,
    "closing_time" TIME NOT NULL,

    CONSTRAINT "restaurant_operating_hours_pkey" PRIMARY KEY ("restaurant_id","day_of_week")
);

-- CreateTable
CREATE TABLE "restaurant_meal_services" (
    "service_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "adult_price" DECIMAL(10,2) NOT NULL,
    "child_price" DECIMAL(10,2) NOT NULL,
    "child_age_limit" INTEGER NOT NULL,
    "service_charge_percentage" DECIMAL(5,2) NOT NULL,
    "tax_percentage" DECIMAL(5,2) NOT NULL,
    "price_updated_at" TIMESTAMP(3) NOT NULL,
    "service_start_time" TIME NOT NULL,
    "service_end_time" TIME NOT NULL,

    CONSTRAINT "restaurant_meal_services_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "restaurant_capacity" (
    "capacity_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "total_seats" INTEGER NOT NULL DEFAULT 0,
    "booked_seats" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restaurant_capacity_pkey" PRIMARY KEY ("capacity_id")
);

-- CreateTable
CREATE TABLE "restaurant_images" (
    "image_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_type" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "caption" TEXT,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" TEXT NOT NULL,
    "last_modified_at" TIMESTAMP(3) NOT NULL,
    "last_modified_by" TEXT NOT NULL,

    CONSTRAINT "restaurant_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "reservation_id" SERIAL NOT NULL,
    "reservation_number" TEXT NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "request_id" INTEGER NOT NULL,
    "reservation_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "reservation_date" DATE NOT NULL,
    "reservation_time" TIME NOT NULL,
    "adult_count" INTEGER NOT NULL,
    "child_count" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "service_charge" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "special_requests" TEXT,
    "dietary_requirements" TEXT,
    "occasion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "reservation_payments" (
    "payment_id" SERIAL NOT NULL,
    "reservation_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "payment_channel" "PaymentChannel" NOT NULL,
    "transaction_reference" TEXT NOT NULL,
    "payment_notes" TEXT,
    "refund_reason" TEXT,
    "refund_amount" DECIMAL(10,2),
    "refund_date" TIMESTAMP(3),
    "processed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "restaurant_special_closures" (
    "closure_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "closure_start" TIMESTAMP(3) NOT NULL,
    "closure_end" TIMESTAMP(3) NOT NULL,
    "closure_type" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "restaurant_special_closures_pkey" PRIMARY KEY ("closure_id")
);

-- CreateTable
CREATE TABLE "reservation_requests" (
    "request_id" SERIAL NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "request_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "requested_date" DATE NOT NULL,
    "requested_time" TIME NOT NULL,
    "adult_count" INTEGER NOT NULL,
    "child_count" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "estimated_total_amount" DECIMAL(10,2) NOT NULL,
    "estimated_service_charge" DECIMAL(10,2) NOT NULL,
    "estimated_tax_amount" DECIMAL(10,2) NOT NULL,
    "status" "ReservationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "special_requests" TEXT,
    "dietary_requirements" TEXT,
    "occasion" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMP(3),
    "processing_completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "reservation_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "reservation_request_status_history" (
    "history_id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "previous_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "change_reason" TEXT NOT NULL,
    "status_changed_at" TIMESTAMP(3) NOT NULL,
    "changed_by" TEXT NOT NULL,

    CONSTRAINT "reservation_request_status_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "reservation_request_payments" (
    "payment_attempt_id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_initiated_at" TIMESTAMP(3) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "payment_provider" TEXT NOT NULL,
    "payment_channel" "PaymentChannel" NOT NULL,
    "transaction_reference" TEXT NOT NULL,
    "name_on_card" TEXT,
    "masked_card_number" TEXT,
    "failure_reason" TEXT,
    "notified_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payment_status_url" TEXT,

    CONSTRAINT "reservation_request_payments_pkey" PRIMARY KEY ("payment_attempt_id")
);

-- CreateTable
CREATE TABLE "reservation_reviews" (
    "review_id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "food_rating" INTEGER NOT NULL,
    "service_rating" INTEGER NOT NULL,
    "ambiance_rating" INTEGER NOT NULL,
    "review_text" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "dining_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "moderation_status" TEXT NOT NULL,
    "moderation_notes" TEXT,
    "moderated_at" TIMESTAMP(3),
    "moderated_by" TEXT,

    CONSTRAINT "reservation_reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "reservation_review_photos" (
    "photo_id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_caption" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,

    CONSTRAINT "reservation_review_photos_pkey" PRIMARY KEY ("photo_id")
);

-- CreateTable
CREATE TABLE "reservation_review_responses" (
    "response_id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "response_text" TEXT NOT NULL,
    "responded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reservation_review_responses_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "cities" (
    "city_id" SERIAL NOT NULL,
    "city_name" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "postal_code_pattern" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("city_id")
);

-- CreateTable
CREATE TABLE "restaurant_service_areas" (
    "restaurant_id" INTEGER NOT NULL,
    "city_id" INTEGER NOT NULL,
    "delivery_radius_km" DECIMAL(10,2) NOT NULL,
    "estimated_delivery_time_min" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "restaurant_service_areas_pkey" PRIMARY KEY ("restaurant_id","city_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_thumbnail_image_id_key" ON "restaurants"("thumbnail_image_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_meal_services_restaurant_id_meal_type_service_st_key" ON "restaurant_meal_services"("restaurant_id", "meal_type", "service_start_time", "service_end_time");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reservation_number_key" ON "reservations"("reservation_number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_request_id_key" ON "reservations"("request_id");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_thumbnail_image_id_fkey" FOREIGN KEY ("thumbnail_image_id") REFERENCES "restaurant_images"("image_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_cuisine_id_fkey" FOREIGN KEY ("cuisine_id") REFERENCES "cuisines"("cuisine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_operating_hours" ADD CONSTRAINT "restaurant_operating_hours_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_meal_services" ADD CONSTRAINT "restaurant_meal_services_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_capacity" ADD CONSTRAINT "restaurant_capacity_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_capacity" ADD CONSTRAINT "restaurant_capacity_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "restaurant_meal_services"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_images" ADD CONSTRAINT "restaurant_images_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_special_closures" ADD CONSTRAINT "restaurant_special_closures_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_status_history" ADD CONSTRAINT "reservation_request_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_payments" ADD CONSTRAINT "reservation_request_payments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "reservation_requests"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_reviews" ADD CONSTRAINT "reservation_reviews_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("reservation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_reviews" ADD CONSTRAINT "reservation_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_review_photos" ADD CONSTRAINT "reservation_review_photos_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reservation_reviews"("review_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_review_responses" ADD CONSTRAINT "reservation_review_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reservation_reviews"("review_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_service_areas" ADD CONSTRAINT "restaurant_service_areas_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("restaurant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_service_areas" ADD CONSTRAINT "restaurant_service_areas_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE RESTRICT ON UPDATE CASCADE;
