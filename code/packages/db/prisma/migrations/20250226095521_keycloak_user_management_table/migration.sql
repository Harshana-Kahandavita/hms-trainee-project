-- CreateEnum
CREATE TYPE "KeycloakRole" AS ENUM ('admin', 'IT', 'Finance', 'Staff');

-- CreateTable
CREATE TABLE "merchant_users" (
    "keycloak_user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "KeycloakRole",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_users_pkey" PRIMARY KEY ("keycloak_user_id")
);
