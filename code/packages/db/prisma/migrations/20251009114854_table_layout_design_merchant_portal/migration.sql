-- AlterTable
ALTER TABLE "restaurant_sections" ADD COLUMN     "canvas_data" JSONB,
ADD COLUMN     "canvas_height" INTEGER DEFAULT 600,
ADD COLUMN     "canvas_width" INTEGER DEFAULT 800,
ADD COLUMN     "floor_plan_image" TEXT,
ADD COLUMN     "is_canvas_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "canvas_properties" JSONB,
ADD COLUMN     "fabric_object_id" TEXT,
ADD COLUMN     "is_draggable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_resizable" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "restaurant_tables_fabric_object_id_idx" ON "restaurant_tables"("fabric_object_id");
