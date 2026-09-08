-- =============================================================
-- 塔界远征 · 手机号字段 + 展示 ID 拓宽（已有库执行这个，新库直接跑 schema.sql）
--
--   mysql -u root -p tower_odyssey < deploy/mysql/alter-account.sql
--   或粘贴到 phpMyAdmin → SQL 执行
--
-- 如果只是想"手机号"功能，正常情况下**不需要**手动跑这个文件：
--   server.js 启动时会自动检查列、索引、列宽度，缺啥补啥。
-- 这个文件只用于：
--   ① 自动迁移失败时手工补
--   ② 你想离线在数据库里把数据改好
--
-- 关键：建 phone 唯一索引前，先把空串 '' 改成 NULL。
--   MySQL 唯一索引里多个空串算"重复"会报错；多个 NULL 允许并存，对应"未绑定手机"场景。
-- =============================================================
USE `tower_odyssey`;

-- 1) 加列（已存在会报错，忽略即可）
ALTER TABLE `players`
    ADD COLUMN `phone` VARCHAR(20) NULL COMMENT '绑定手机号（可登录）' AFTER `display_id`;

-- 2) 展示 ID 老列宽度可能不够（VARCHAR(12) 装不下 14 位），自动拓宽到 20
ALTER TABLE `players` MODIFY COLUMN `display_id` VARCHAR(20) NULL COMMENT '展示 ID，14 位字母数字，全局唯一';

-- 3) 关键：建 phone 唯一索引前先清空串
UPDATE `players` SET `phone` = NULL WHERE `phone` = '' OR `phone` IS NULL;

-- 4) 加唯一索引（已存在会报错，忽略即可）
ALTER TABLE `players` ADD UNIQUE KEY `uk_phone` (`phone`);
