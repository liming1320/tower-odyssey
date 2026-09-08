-- =============================================================
-- 塔界远征 · MySQL 数据库结构
-- 设计原则：玩家数据与代码彻底分离，代码回滚 / 重新部署都不影响玩家数据
--
-- 【版本要求】MySQL 5.7.0+ / 8.x / MariaDB 10.2+ 均可
--   用到了 JSON 列与 utf8mb4。宝塔软件商店里的 **MySQL 5.7.44 直接可用**，
--   不必特意折腾 MySQL 8。
--
-- 使用方式（任选其一）：
--   mysql -u root -p < deploy/mysql/schema.sql
--   或粘贴到宝塔 → 数据库 → phpMyAdmin → SQL 执行
--
-- 环境变量（生产切 MySQL）：
--   DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=to_user \
--   DB_PASS=你的密码 DB_NAME=tower_odyssey
-- =============================================================

CREATE DATABASE IF NOT EXISTS `tower_odyssey`
    DEFAULT CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE `tower_odyssey`;

-- -------------------------------------------------------------
-- 1. 玩家账号（只存登录信息，不存游戏进度）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `players`;
CREATE TABLE `players` (
    `id`             VARCHAR(36)  NOT NULL COMMENT '玩家唯一 ID（UUID）',
    `username`       VARCHAR(64)  NOT NULL COMMENT '登录名',
    `pass_hash`      VARCHAR(128) NOT NULL COMMENT '密码哈希（sha256+salt）',
    `salt`           VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '密码盐',
    `is_admin`       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否管理员',
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login`     DATETIME     NULL COMMENT '最近登录时间',
    `last_login_day` DATE         NULL COMMENT '最近登录日期（签到用）',
    `login_days`     INT          NOT NULL DEFAULT 0 COMMENT '累计登录天数',
    `banned`         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否封禁',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    KEY `idx_last_login` (`last_login`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='玩家账号';

-- -------------------------------------------------------------
-- 2. 玩家存档（整份进度存 JSON 列）
--    换设备登录即拉取这份数据；代码回滚 / 重新部署都不会动到它
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `player_state`;
CREATE TABLE `player_state` (
    `player_id`  VARCHAR(36) NOT NULL,
    `state`      JSON        NOT NULL COMMENT '玩家全部进度：英雄/装备/资源/建筑/邮件已领等',
    `version`    INT         NOT NULL DEFAULT 1 COMMENT '存档版本，用于结构升级',
    `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`player_id`),
    CONSTRAINT `fk_state_player` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='玩家游戏存档';

-- -------------------------------------------------------------
-- 3. 英雄配置（改名 / 改技能 / 换立绘 直接改这张表，无需改代码）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `heroes`;
CREATE TABLE `heroes` (
    `id`           VARCHAR(16)  NOT NULL COMMENT '英雄 ID，如 h01 / m31',
    `name`         VARCHAR(64)  NOT NULL COMMENT '英雄名称（改这里即可改名）',
    `rarity`       VARCHAR(16)  NOT NULL DEFAULT '稀有' COMMENT '稀有/优秀/史诗/传说/传说+',
    `element`      VARCHAR(8)   NOT NULL DEFAULT '光' COMMENT '草/水/火/光/暗',
    `tier`         INT          NOT NULL DEFAULT 1 COMMENT '星级档位 3/4/5',
    `base_atk`     INT          NOT NULL DEFAULT 0 COMMENT '基础攻击',
    `base_hp`      INT          NOT NULL DEFAULT 0 COMMENT '基础生命',
    `img`          VARCHAR(128) NOT NULL DEFAULT '' COMMENT '立绘路径，如 heroes/h01.svg',
    `avatar`       VARCHAR(128) DEFAULT NULL COMMENT '头像路径，如 avatars/h01.svg',
    `material`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=许愿材料英雄（不上阵）',
    `hero_desc`    VARCHAR(255) DEFAULT NULL COMMENT '英雄描述',
    -- 主技能（单技能逻辑读这几个字段；多技能看 hero_skills 表）
    `skill_name`       VARCHAR(64)   DEFAULT NULL,
    `skill_desc`       VARCHAR(255)  DEFAULT NULL,
    `skill_cd`         INT           DEFAULT 0,
    `skill_multiplier` DECIMAL(8,3)  DEFAULT 0 COMMENT '伤害倍率，2.2 = 220%',
    `skill_fx`         VARCHAR(32)   DEFAULT NULL COMMENT '特效类型：slash/water/fire/...',
    `skill_tint`       VARCHAR(16)   DEFAULT NULL COMMENT '特效颜色 #rrggbb',
    `enabled`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=下架（图鉴不显示，老玩家保留）',
    `sort_order`  INT          NOT NULL DEFAULT 0 COMMENT '排序',
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_element`  (`element`),
    KEY `idx_material` (`material`),
    KEY `idx_enabled`  (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='英雄配置表';

-- -------------------------------------------------------------
-- 4. 英雄多技能（一个英雄可配多个技能，slot 0 为主技能）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `hero_skills`;
CREATE TABLE `hero_skills` (
    `id`         INT AUTO_INCREMENT,
    `hero_id`    VARCHAR(16) NOT NULL,
    `slot`       INT         NOT NULL DEFAULT 0 COMMENT '技能槽位，0 为主技能',
    `name`       VARCHAR(64) NOT NULL,
    `skill_desc` VARCHAR(255) DEFAULT NULL,
    `cd`         INT          DEFAULT 0 COMMENT '冷却秒数',
    `multiplier` DECIMAL(8,3) DEFAULT 0 COMMENT '伤害/治疗倍率',
    `fx`         VARCHAR(32)  DEFAULT NULL,
    `tint`       VARCHAR(16)  DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_hero_slot` (`hero_id`, `slot`),
    CONSTRAINT `fk_skill_hero` FOREIGN KEY (`hero_id`) REFERENCES `heroes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='英雄技能表';

-- -------------------------------------------------------------
-- 5. 全局数据（聊天 / 全服邮件 / 部落 / 大地图 / 远古世界）
--    以 key-value 存 JSON，避免为每类数据单独建表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `game_meta`;
CREATE TABLE `game_meta` (
    `meta_key`   VARCHAR(64) NOT NULL,
    `meta_value` JSON        NOT NULL,
    `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`meta_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局数据（邮件/聊天/部落等）';

-- -------------------------------------------------------------
-- 6. 邮件（后台发放资源走这里，玩家在游戏内「邮件」领取）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `mails`;
CREATE TABLE `mails` (
    `id`       BIGINT AUTO_INCREMENT,
    `to_user`  VARCHAR(64) DEFAULT NULL COMMENT '收件人；NULL 表示全服邮件',
    `title`    VARCHAR(128) NOT NULL,
    `content`  VARCHAR(512) DEFAULT NULL,
    `rewards`  JSON         DEFAULT NULL COMMENT '附件，如 {"diamond":500}',
    `from`     VARCHAR(32)  DEFAULT '系统',
    `created_at` DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `claimed`  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已领取',
    PRIMARY KEY (`id`),
    KEY `idx_to_user` (`to_user`),
    KEY `idx_claimed` (`claimed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='游戏内邮件';

-- -------------------------------------------------------------
-- 7. 操作日志（后台改名、发资源等留痕，便于回溯）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `admin_logs`;
CREATE TABLE `admin_logs` (
    `id`         BIGINT AUTO_INCREMENT,
    `admin`      VARCHAR(64)  NOT NULL,
    `action`     VARCHAR(64)  NOT NULL COMMENT '如 hero.rename / mail.send',
    `target`     VARCHAR(128) DEFAULT NULL,
    `detail`     JSON         DEFAULT NULL,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台操作日志';

-- =============================================================
-- 建专用账号（生产环境建议用，不要用 root）
--   默认密码请自行修改！
--
--   ⚠ MySQL 5.7 不支持 "CREATE USER IF NOT EXISTS"（那是 8.0 的语法），
--     所以账号已存在时下面第一条会报错，忽略即可；或先执行 DROP USER 再建。
-- =============================================================
-- DROP USER IF EXISTS 'to_user'@'%';
-- CREATE USER 'to_user'@'%' IDENTIFIED BY '改成强密码';
-- GRANT SELECT,INSERT,UPDATE,DELETE ON `tower_odyssey`.* TO 'to_user'@'%';
-- FLUSH PRIVILEGES;
