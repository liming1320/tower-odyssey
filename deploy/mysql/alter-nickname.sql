-- =============================================================
-- 塔界远征 · 昵称 / 展示 ID 字段升级（已有库执行这个，新库直接跑 schema.sql）
--
--   mysql -u root -p tower_odyssey < deploy/mysql/alter-nickname.sql
--   或粘贴到 phpMyAdmin → SQL 执行
--
-- 说明：老玩家的 nickname 会先用登录名填充，display_id 留空，
--       服务启动后会自动给空 ID 的玩家补一个唯一展示 ID。
-- =============================================================
USE `tower_odyssey`;

-- 加列（已存在会报错，忽略即可）
ALTER TABLE `players`
    ADD COLUMN `nickname`   VARCHAR(24) NULL COMMENT '玩家昵称（对外展示，可修改）' AFTER `banned`,
    ADD COLUMN `display_id` VARCHAR(12) NULL COMMENT '展示 ID，如 #7K9M2A' AFTER `nickname`;

-- 老玩家昵称先用登录名填充（昵称已存在则跳过）
UPDATE `players` SET `nickname` = `username` WHERE `nickname` IS NULL OR `nickname` = '';

-- 唯一索引：昵称不可重复，展示 ID 全局唯一
-- （若报 "Duplicate entry"，说明有重名，先手工处理再执行）
ALTER TABLE `players` ADD UNIQUE KEY `uk_nickname`   (`nickname`);
ALTER TABLE `players` ADD UNIQUE KEY `uk_display_id` (`display_id`);

-- 查看结果
SELECT `id`, `username`, `nickname`, `display_id` FROM `players` LIMIT 20;
