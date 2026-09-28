-- CreateTable
CREATE TABLE `MapAsset` (
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `currentVersion` INTEGER NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MapVersion` (
    `mapId` VARCHAR(80) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `document` JSON NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`mapId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DeviceModel` (
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `currentVersion` INTEGER NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DeviceModelVersion` (
    `modelId` VARCHAR(80) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `category` ENUM('tugger', 'forklift', 'amr', 'quadruped', 'custom') NOT NULL,
    `length` DOUBLE NOT NULL,
    `width` DOUBLE NOT NULL,
    `height` DOUBLE NOT NULL,
    `wheelbase` DOUBLE NOT NULL,
    `maxSpeed` DOUBLE NOT NULL,
    `maxSteer` DOUBLE NOT NULL,
    `mass` DOUBLE NOT NULL,
    `trailers` INTEGER NOT NULL,
    `trailerLength` DOUBLE NOT NULL,
    `trailerWidth` DOUBLE NOT NULL,
    `hitchLength` DOUBLE NOT NULL,
    `sensors` JSON NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`modelId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Gateway` (
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `adapter` ENUM('simulation', 'external') NOT NULL,
    `location` ENUM('local', 'edge', 'cloud') NOT NULL,
    `endpoint` VARCHAR(500) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `GatewayChannel` (
    `id` VARCHAR(80) NOT NULL,
    `gatewayId` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` ENUM('telemetry', 'events', 'video', 'pointcloud', 'logs') NOT NULL,
    `topic` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `GatewayChannel_gatewayId_name_key`(`gatewayId`, `name`),
    UNIQUE INDEX `GatewayChannel_gatewayId_id_key`(`gatewayId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Park` (
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ParkRevision` (
    `parkId` VARCHAR(80) NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`parkId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ParkMap` (
    `parkId` VARCHAR(80) NOT NULL,
    `mapId` VARCHAR(80) NOT NULL,
    `mapVersion` INTEGER NOT NULL,
    `x` DOUBLE NOT NULL DEFAULT 0,
    `y` DOUBLE NOT NULL DEFAULT 0,
    `yaw` DOUBLE NOT NULL DEFAULT 0,

    PRIMARY KEY (`parkId`, `mapId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ParkModel` (
    `parkId` VARCHAR(80) NOT NULL,
    `modelId` VARCHAR(80) NOT NULL,
    `modelVersion` INTEGER NOT NULL,

    PRIMARY KEY (`parkId`, `modelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ParkGateway` (
    `parkId` VARCHAR(80) NOT NULL,
    `gatewayId` VARCHAR(80) NOT NULL,

    PRIMARY KEY (`parkId`, `gatewayId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DeviceInstance` (
    `parkId` VARCHAR(80) NOT NULL,
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` ENUM('virtual', 'physical') NOT NULL,
    `modelId` VARCHAR(80) NOT NULL,
    `mapId` VARCHAR(80) NOT NULL,
    `levelKey` VARCHAR(120) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `yaw` DOUBLE NOT NULL,
    `gatewayId` VARCHAR(80) NULL,
    `serial` VARCHAR(200) NULL,

    INDEX `DeviceInstance_parkId_modelId_idx`(`parkId`, `modelId`),
    INDEX `DeviceInstance_parkId_mapId_idx`(`parkId`, `mapId`),
    INDEX `DeviceInstance_parkId_gatewayId_idx`(`parkId`, `gatewayId`),
    PRIMARY KEY (`parkId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DeviceChannelBinding` (
    `parkId` VARCHAR(80) NOT NULL,
    `deviceId` VARCHAR(80) NOT NULL,
    `gatewayId` VARCHAR(80) NOT NULL,
    `channelId` VARCHAR(80) NOT NULL,

    INDEX `DeviceChannelBinding_gatewayId_channelId_idx`(`gatewayId`, `channelId`),
    PRIMARY KEY (`parkId`, `deviceId`, `channelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SceneObject` (
    `parkId` VARCHAR(80) NOT NULL,
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('charging', 'parking', 'loading', 'unloading', 'waypoint', 'door', 'restricted', 'speed', 'route') NOT NULL,
    `mapId` VARCHAR(80) NOT NULL,
    `levelKey` VARCHAR(120) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `yaw` DOUBLE NOT NULL,
    `width` DOUBLE NOT NULL,
    `height` DOUBLE NOT NULL,
    `value` DOUBLE NOT NULL,
    `points` JSON NOT NULL,

    INDEX `SceneObject_parkId_mapId_levelKey_type_idx`(`parkId`, `mapId`, `levelKey`, `type`),
    PRIMARY KEY (`parkId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Task` (
    `parkId` VARCHAR(80) NOT NULL,
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `deviceId` VARCHAR(80) NOT NULL,
    `routeId` VARCHAR(80) NOT NULL,
    `durationSeconds` DOUBLE NOT NULL,
    `speedMps` DOUBLE NOT NULL,
    `engine` ENUM('kinematic', 'chrono') NOT NULL,

    INDEX `Task_parkId_deviceId_idx`(`parkId`, `deviceId`),
    INDEX `Task_parkId_routeId_idx`(`parkId`, `routeId`),
    PRIMARY KEY (`parkId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SimulationRun` (
    `id` VARCHAR(80) NOT NULL,
    `parkId` VARCHAR(80) NULL,
    `parkVersion` INTEGER NULL,
    `taskId` VARCHAR(80) NULL,
    `engine` ENUM('park', 'yard', 'road', 'chrono') NOT NULL,
    `engineVersion` VARCHAR(120) NOT NULL,
    `codeFingerprint` VARCHAR(200) NOT NULL,
    `status` ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted') NOT NULL,
    `verdict` VARCHAR(80) NULL,
    `inputSnapshot` JSON NOT NULL,
    `inputHash` CHAR(64) NOT NULL,
    `metrics` JSON NULL,
    `error` JSON NULL,
    `cancelRequestedAt` DATETIME(3) NULL,
    `leaseOwner` VARCHAR(120) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `SimulationRun_parkId_createdAt_idx`(`parkId`, `createdAt`),
    INDEX `SimulationRun_parkId_parkVersion_idx`(`parkId`, `parkVersion`),
    INDEX `SimulationRun_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `SimulationRun_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RunArtifact` (
    `id` VARCHAR(80) NOT NULL,
    `runId` VARCHAR(80) NOT NULL,
    `role` VARCHAR(80) NOT NULL,
    `mediaType` VARCHAR(120) NOT NULL,
    `storageKey` VARCHAR(500) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RunArtifact_runId_role_idx`(`runId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor` VARCHAR(120) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityKind` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(80) NOT NULL,
    `entityVersion` INTEGER NULL,
    `parkId` VARCHAR(80) NULL,
    `details` JSON NULL,

    INDEX `AuditEvent_entityKind_entityId_at_idx`(`entityKind`, `entityId`, `at`),
    INDEX `AuditEvent_parkId_at_idx`(`parkId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `MapVersion` ADD CONSTRAINT `MapVersion_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `MapAsset`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceModelVersion` ADD CONSTRAINT `DeviceModelVersion_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `DeviceModel`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GatewayChannel` ADD CONSTRAINT `GatewayChannel_gatewayId_fkey` FOREIGN KEY (`gatewayId`) REFERENCES `Gateway`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkRevision` ADD CONSTRAINT `ParkRevision_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkMap` ADD CONSTRAINT `ParkMap_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkMap` ADD CONSTRAINT `ParkMap_mapId_mapVersion_fkey` FOREIGN KEY (`mapId`, `mapVersion`) REFERENCES `MapVersion`(`mapId`, `version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkModel` ADD CONSTRAINT `ParkModel_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkModel` ADD CONSTRAINT `ParkModel_modelId_modelVersion_fkey` FOREIGN KEY (`modelId`, `modelVersion`) REFERENCES `DeviceModelVersion`(`modelId`, `version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkGateway` ADD CONSTRAINT `ParkGateway_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParkGateway` ADD CONSTRAINT `ParkGateway_gatewayId_fkey` FOREIGN KEY (`gatewayId`) REFERENCES `Gateway`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceInstance` ADD CONSTRAINT `DeviceInstance_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceInstance` ADD CONSTRAINT `DeviceInstance_parkId_modelId_fkey` FOREIGN KEY (`parkId`, `modelId`) REFERENCES `ParkModel`(`parkId`, `modelId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceInstance` ADD CONSTRAINT `DeviceInstance_parkId_mapId_fkey` FOREIGN KEY (`parkId`, `mapId`) REFERENCES `ParkMap`(`parkId`, `mapId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceInstance` ADD CONSTRAINT `DeviceInstance_parkId_gatewayId_fkey` FOREIGN KEY (`parkId`, `gatewayId`) REFERENCES `ParkGateway`(`parkId`, `gatewayId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceChannelBinding` ADD CONSTRAINT `DeviceChannelBinding_parkId_deviceId_fkey` FOREIGN KEY (`parkId`, `deviceId`) REFERENCES `DeviceInstance`(`parkId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeviceChannelBinding` ADD CONSTRAINT `DeviceChannelBinding_gatewayId_channelId_fkey` FOREIGN KEY (`gatewayId`, `channelId`) REFERENCES `GatewayChannel`(`gatewayId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SceneObject` ADD CONSTRAINT `SceneObject_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SceneObject` ADD CONSTRAINT `SceneObject_parkId_mapId_fkey` FOREIGN KEY (`parkId`, `mapId`) REFERENCES `ParkMap`(`parkId`, `mapId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parkId_fkey` FOREIGN KEY (`parkId`) REFERENCES `Park`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parkId_deviceId_fkey` FOREIGN KEY (`parkId`, `deviceId`) REFERENCES `DeviceInstance`(`parkId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parkId_routeId_fkey` FOREIGN KEY (`parkId`, `routeId`) REFERENCES `SceneObject`(`parkId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SimulationRun` ADD CONSTRAINT `SimulationRun_parkId_parkVersion_fkey` FOREIGN KEY (`parkId`, `parkVersion`) REFERENCES `ParkRevision`(`parkId`, `version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RunArtifact` ADD CONSTRAINT `RunArtifact_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `SimulationRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE `SimulationRun` ADD CONSTRAINT `run_park_pair` CHECK ((`parkId` IS NULL AND `parkVersion` IS NULL) OR (`parkId` IS NOT NULL AND `parkVersion` IS NOT NULL));

