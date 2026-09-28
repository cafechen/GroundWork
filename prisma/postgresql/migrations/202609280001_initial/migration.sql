-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('tugger', 'forklift', 'amr', 'quadruped', 'custom');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('virtual', 'physical');

-- CreateEnum
CREATE TYPE "GatewayAdapter" AS ENUM ('simulation', 'external');

-- CreateEnum
CREATE TYPE "GatewayLocation" AS ENUM ('local', 'edge', 'cloud');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('telemetry', 'events', 'video', 'pointcloud', 'logs');

-- CreateEnum
CREATE TYPE "SceneObjectType" AS ENUM ('charging', 'parking', 'loading', 'unloading', 'waypoint', 'door', 'restricted', 'speed', 'route');

-- CreateEnum
CREATE TYPE "TaskEngine" AS ENUM ('kinematic', 'chrono');

-- CreateEnum
CREATE TYPE "RunEngine" AS ENUM ('park', 'yard', 'road', 'chrono');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted');

-- CreateTable
CREATE TABLE "MapAsset" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapVersion" (
    "mapId" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "document" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapVersion_pkey" PRIMARY KEY ("mapId","version")
);

-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceModelVersion" (
    "modelId" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "DeviceCategory" NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "wheelbase" DOUBLE PRECISION NOT NULL,
    "maxSpeed" DOUBLE PRECISION NOT NULL,
    "maxSteer" DOUBLE PRECISION NOT NULL,
    "mass" DOUBLE PRECISION NOT NULL,
    "trailers" INTEGER NOT NULL,
    "trailerLength" DOUBLE PRECISION NOT NULL,
    "trailerWidth" DOUBLE PRECISION NOT NULL,
    "hitchLength" DOUBLE PRECISION NOT NULL,
    "sensors" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceModelVersion_pkey" PRIMARY KEY ("modelId","version")
);

-- CreateTable
CREATE TABLE "Gateway" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "adapter" "GatewayAdapter" NOT NULL,
    "location" "GatewayLocation" NOT NULL,
    "endpoint" VARCHAR(500),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayChannel" (
    "id" VARCHAR(80) NOT NULL,
    "gatewayId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "topic" VARCHAR(200) NOT NULL,

    CONSTRAINT "GatewayChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Park" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Park_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkRevision" (
    "parkId" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkRevision_pkey" PRIMARY KEY ("parkId","version")
);

-- CreateTable
CREATE TABLE "ParkMap" (
    "parkId" VARCHAR(80) NOT NULL,
    "mapId" VARCHAR(80) NOT NULL,
    "mapVersion" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yaw" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ParkMap_pkey" PRIMARY KEY ("parkId","mapId")
);

-- CreateTable
CREATE TABLE "ParkModel" (
    "parkId" VARCHAR(80) NOT NULL,
    "modelId" VARCHAR(80) NOT NULL,
    "modelVersion" INTEGER NOT NULL,

    CONSTRAINT "ParkModel_pkey" PRIMARY KEY ("parkId","modelId")
);

-- CreateTable
CREATE TABLE "ParkGateway" (
    "parkId" VARCHAR(80) NOT NULL,
    "gatewayId" VARCHAR(80) NOT NULL,

    CONSTRAINT "ParkGateway_pkey" PRIMARY KEY ("parkId","gatewayId")
);

-- CreateTable
CREATE TABLE "DeviceInstance" (
    "parkId" VARCHAR(80) NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "modelId" VARCHAR(80) NOT NULL,
    "mapId" VARCHAR(80) NOT NULL,
    "levelKey" VARCHAR(120) NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "yaw" DOUBLE PRECISION NOT NULL,
    "gatewayId" VARCHAR(80),
    "serial" VARCHAR(200),

    CONSTRAINT "DeviceInstance_pkey" PRIMARY KEY ("parkId","id")
);

-- CreateTable
CREATE TABLE "DeviceChannelBinding" (
    "parkId" VARCHAR(80) NOT NULL,
    "deviceId" VARCHAR(80) NOT NULL,
    "gatewayId" VARCHAR(80) NOT NULL,
    "channelId" VARCHAR(80) NOT NULL,

    CONSTRAINT "DeviceChannelBinding_pkey" PRIMARY KEY ("parkId","deviceId","channelId")
);

-- CreateTable
CREATE TABLE "SceneObject" (
    "parkId" VARCHAR(80) NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "SceneObjectType" NOT NULL,
    "mapId" VARCHAR(80) NOT NULL,
    "levelKey" VARCHAR(120) NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "yaw" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "points" JSONB NOT NULL,

    CONSTRAINT "SceneObject_pkey" PRIMARY KEY ("parkId","id")
);

-- CreateTable
CREATE TABLE "Task" (
    "parkId" VARCHAR(80) NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "deviceId" VARCHAR(80) NOT NULL,
    "routeId" VARCHAR(80) NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "speedMps" DOUBLE PRECISION NOT NULL,
    "engine" "TaskEngine" NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("parkId","id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" VARCHAR(80) NOT NULL,
    "parkId" VARCHAR(80),
    "parkVersion" INTEGER,
    "taskId" VARCHAR(80),
    "engine" "RunEngine" NOT NULL,
    "engineVersion" VARCHAR(120) NOT NULL,
    "codeFingerprint" VARCHAR(200) NOT NULL,
    "status" "RunStatus" NOT NULL,
    "verdict" VARCHAR(80),
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "metrics" JSONB,
    "error" JSONB,
    "cancelRequestedAt" TIMESTAMP(3),
    "leaseOwner" VARCHAR(120),
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunArtifact" (
    "id" VARCHAR(80) NOT NULL,
    "runId" VARCHAR(80) NOT NULL,
    "role" VARCHAR(80) NOT NULL,
    "mediaType" VARCHAR(120) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(120) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityKind" VARCHAR(80) NOT NULL,
    "entityId" VARCHAR(80) NOT NULL,
    "entityVersion" INTEGER,
    "parkId" VARCHAR(80),
    "details" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GatewayChannel_gatewayId_name_key" ON "GatewayChannel"("gatewayId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayChannel_gatewayId_id_key" ON "GatewayChannel"("gatewayId", "id");

-- CreateIndex
CREATE INDEX "DeviceInstance_parkId_modelId_idx" ON "DeviceInstance"("parkId", "modelId");

-- CreateIndex
CREATE INDEX "DeviceInstance_parkId_mapId_idx" ON "DeviceInstance"("parkId", "mapId");

-- CreateIndex
CREATE INDEX "DeviceInstance_parkId_gatewayId_idx" ON "DeviceInstance"("parkId", "gatewayId");

-- CreateIndex
CREATE INDEX "DeviceChannelBinding_gatewayId_channelId_idx" ON "DeviceChannelBinding"("gatewayId", "channelId");

-- CreateIndex
CREATE INDEX "SceneObject_parkId_mapId_levelKey_type_idx" ON "SceneObject"("parkId", "mapId", "levelKey", "type");

-- CreateIndex
CREATE INDEX "Task_parkId_deviceId_idx" ON "Task"("parkId", "deviceId");

-- CreateIndex
CREATE INDEX "Task_parkId_routeId_idx" ON "Task"("parkId", "routeId");

-- CreateIndex
CREATE INDEX "SimulationRun_parkId_createdAt_idx" ON "SimulationRun"("parkId", "createdAt");

-- CreateIndex
CREATE INDEX "SimulationRun_parkId_parkVersion_idx" ON "SimulationRun"("parkId", "parkVersion");

-- CreateIndex
CREATE INDEX "SimulationRun_status_createdAt_idx" ON "SimulationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SimulationRun_status_leaseExpiresAt_idx" ON "SimulationRun"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "RunArtifact_runId_role_idx" ON "RunArtifact"("runId", "role");

-- CreateIndex
CREATE INDEX "AuditEvent_entityKind_entityId_at_idx" ON "AuditEvent"("entityKind", "entityId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_parkId_at_idx" ON "AuditEvent"("parkId", "at");

-- AddForeignKey
ALTER TABLE "MapVersion" ADD CONSTRAINT "MapVersion_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "MapAsset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceModelVersion" ADD CONSTRAINT "DeviceModelVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "DeviceModel"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GatewayChannel" ADD CONSTRAINT "GatewayChannel_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkRevision" ADD CONSTRAINT "ParkRevision_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkMap" ADD CONSTRAINT "ParkMap_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkMap" ADD CONSTRAINT "ParkMap_mapId_mapVersion_fkey" FOREIGN KEY ("mapId", "mapVersion") REFERENCES "MapVersion"("mapId", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkModel" ADD CONSTRAINT "ParkModel_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkModel" ADD CONSTRAINT "ParkModel_modelId_modelVersion_fkey" FOREIGN KEY ("modelId", "modelVersion") REFERENCES "DeviceModelVersion"("modelId", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkGateway" ADD CONSTRAINT "ParkGateway_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ParkGateway" ADD CONSTRAINT "ParkGateway_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceInstance" ADD CONSTRAINT "DeviceInstance_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceInstance" ADD CONSTRAINT "DeviceInstance_parkId_modelId_fkey" FOREIGN KEY ("parkId", "modelId") REFERENCES "ParkModel"("parkId", "modelId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceInstance" ADD CONSTRAINT "DeviceInstance_parkId_mapId_fkey" FOREIGN KEY ("parkId", "mapId") REFERENCES "ParkMap"("parkId", "mapId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceInstance" ADD CONSTRAINT "DeviceInstance_parkId_gatewayId_fkey" FOREIGN KEY ("parkId", "gatewayId") REFERENCES "ParkGateway"("parkId", "gatewayId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceChannelBinding" ADD CONSTRAINT "DeviceChannelBinding_parkId_deviceId_fkey" FOREIGN KEY ("parkId", "deviceId") REFERENCES "DeviceInstance"("parkId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DeviceChannelBinding" ADD CONSTRAINT "DeviceChannelBinding_gatewayId_channelId_fkey" FOREIGN KEY ("gatewayId", "channelId") REFERENCES "GatewayChannel"("gatewayId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SceneObject" ADD CONSTRAINT "SceneObject_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SceneObject" ADD CONSTRAINT "SceneObject_parkId_mapId_fkey" FOREIGN KEY ("parkId", "mapId") REFERENCES "ParkMap"("parkId", "mapId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parkId_deviceId_fkey" FOREIGN KEY ("parkId", "deviceId") REFERENCES "DeviceInstance"("parkId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parkId_routeId_fkey" FOREIGN KEY ("parkId", "routeId") REFERENCES "SceneObject"("parkId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_parkId_parkVersion_fkey" FOREIGN KEY ("parkId", "parkVersion") REFERENCES "ParkRevision"("parkId", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RunArtifact" ADD CONSTRAINT "RunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "SimulationRun" ADD CONSTRAINT "run_park_pair" CHECK (("parkId" IS NULL AND "parkVersion" IS NULL) OR ("parkId" IS NOT NULL AND "parkVersion" IS NOT NULL));

