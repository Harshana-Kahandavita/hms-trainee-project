-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('PLATFORM', 'MERCHANT');

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "buffet_types" "MealType"[] DEFAULT ARRAY[]::"MealType"[],
ADD COLUMN     "campaign_type" "CampaignType" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN     "first_order_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;
