-- Recallr database, created from scratch: tables and columns in snake_case, every table with created_at and updated_at.
-- Only CREATE TABLE statements: foreign keys are declared inside their tables, and tables come after the ones they reference.

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NULL,
    `referral_code` VARCHAR(191) NULL,
    `referred_by_id` VARCHAR(191) NULL,
    `referral_rewarded_at` DATETIME(3) NULL,
    `save_answers` BOOLEAN NOT NULL DEFAULT true,
    `weekly_email` BOOLEAN NOT NULL DEFAULT true,
    `last_weekly_email_at` DATETIME(3) NULL,
    `profile_sync` BOOLEAN NOT NULL DEFAULT true,
    `billing_name` VARCHAR(200) NOT NULL DEFAULT '',
    `billing_address` VARCHAR(500) NOT NULL DEFAULT '',
    `billing_state` VARCHAR(60) NOT NULL DEFAULT '',
    `gstin` VARCHAR(15) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `whatsapp_reminders` BOOLEAN NOT NULL DEFAULT false,
    `whatsapp_daily` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_referral_code_key`(`referral_code`),
    PRIMARY KEY (`id`),
    CONSTRAINT `users_referred_by_id_fkey` FOREIGN KEY (`referred_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(1000) NOT NULL DEFAULT '',
    `price_paise` INTEGER NOT NULL,
    `duration_days` INTEGER NOT NULL,
    `listening_minutes` INTEGER NULL,
    `token_limit` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `is_trial` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `kind` ENUM('PERCENT', 'FIXED') NOT NULL,
    `amount` INTEGER NOT NULL,
    `max_uses` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `one_per_user` BOOLEAN NOT NULL DEFAULT true,
    `plan_ids` JSON NULL,
    `expires_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `amount_paise` INTEGER NOT NULL,
    `discount_paise` INTEGER NOT NULL DEFAULT 0,
    `coupon_id` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `method` ENUM('RAZORPAY', 'OFFLINE', 'COUPON') NOT NULL,
    `status` ENUM('CREATED', 'PENDING', 'PAID', 'FAILED', 'REJECTED') NOT NULL,
    `razorpay_order_id` VARCHAR(191) NULL,
    `razorpay_payment_id` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `recorded_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paid_at` DATETIME(3) NULL,

    UNIQUE INDEX `payments_razorpay_order_id_key`(`razorpay_order_id`),
    UNIQUE INDEX `payments_razorpay_payment_id_key`(`razorpay_payment_id`),
    INDEX `payments_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `payments_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `payments_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `payments_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('COLLEGE', 'BOOTCAMP', 'COMPANY', 'OTHER') NOT NULL DEFAULT 'COLLEGE',
    `seats` INTEGER NOT NULL,
    `member_minutes` INTEGER NULL,
    `member_tokens` INTEGER NULL,
    `member_days` INTEGER NOT NULL DEFAULT 90,
    `invite_code` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NULL,
    `contact_email` VARCHAR(191) NOT NULL DEFAULT '',
    `notes` VARCHAR(2000) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `organizations_invite_code_key`(`invite_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NULL,
    `plan_name` VARCHAR(191) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `listening_minutes` INTEGER NULL,
    `token_limit` INTEGER NULL,
    `used_seconds` DOUBLE NOT NULL DEFAULT 0,
    `used_tokens` INTEGER NOT NULL DEFAULT 0,
    `source` ENUM('RAZORPAY', 'OFFLINE', 'ADMIN_GRANT', 'TRIAL', 'REFERRAL', 'COUPON', 'ORGANIZATION') NOT NULL,
    `payment_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notified_ending` BOOLEAN NOT NULL DEFAULT false,
    `notified_low` BOOLEAN NOT NULL DEFAULT false,
    `organization_id` VARCHAR(191) NULL,

    UNIQUE INDEX `purchases_payment_id_key`(`payment_id`),
    INDEX `purchases_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `purchases_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `purchases_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `purchases_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `purchases_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usage_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NOT NULL,
    `purchase_id` VARCHAR(191) NULL,
    `kind` ENUM('CHAT', 'TRANSCRIBE') NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `audio_seconds` DOUBLE NOT NULL DEFAULT 0,
    `latency_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `usage_events_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `usage_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_by_id` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_action_created_at_idx`(`action`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `devices` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `app_version` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `devices_user_id_fingerprint_key`(`user_id`, `fingerprint`),
    PRIMARY KEY (`id`),
    CONSTRAINT `devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trial_claims` (
    `fingerprint` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`fingerprint`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_resets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_resets_token_hash_key`(`token_hash`),
    PRIMARY KEY (`id`),
    CONSTRAINT `password_resets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NULL,
    `to` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `status` ENUM('SENT', 'FAILED', 'SKIPPED') NOT NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `email_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `email_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `level` ENUM('INFO', 'WARNING') NOT NULL DEFAULT 'INFO',
    `audience` ENUM('ALL', 'DESKTOP', 'WEBSITE') NOT NULL DEFAULT 'ALL',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ends_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backups` (
    `user_id` VARCHAR(191) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `device_name` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`),
    CONSTRAINT `backups_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tickets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'ANSWERED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tickets_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `tickets_user_id_updated_at_idx`(`user_id`, `updated_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tickets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_messages` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NULL,
    `from_admin` BOOLEAN NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    CONSTRAINT `ticket_messages_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ticket_messages_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` VARCHAR(191) NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `text_hash` VARCHAR(191) NOT NULL,
    `category` ENUM('ABOUT_YOU', 'EXPERIENCE', 'CODING', 'SYSTEM_DESIGN', 'CONCEPT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `times_asked` INTEGER NOT NULL DEFAULT 1,
    `last_asked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published` BOOLEAN NOT NULL DEFAULT false,
    `slug` VARCHAR(191) NULL,
    `guide` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `questions_text_hash_key`(`text_hash`),
    UNIQUE INDEX `questions_slug_key`(`slug`),
    INDEX `questions_category_published_idx`(`category`, `published`),
    INDEX `questions_times_asked_idx`(`times_asked`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_answers` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NULL,
    `question_text` VARCHAR(500) NOT NULL,
    `category` ENUM('ABOUT_YOU', 'EXPERIENCE', 'CODING', 'SYSTEM_DESIGN', 'CONCEPT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `answer` TEXT NOT NULL,
    `company` VARCHAR(200) NOT NULL DEFAULT '',
    `source` ENUM('AI', 'PREPARED') NOT NULL DEFAULT 'AI',
    `provider` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_answers_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `saved_answers_user_id_category_idx`(`user_id`, `category`),
    INDEX `saved_answers_company_idx`(`company`),
    PRIMARY KEY (`id`),
    CONSTRAINT `saved_answers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `saved_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT '',
    `question_count` INTEGER NOT NULL,
    `average_score` DOUBLE NULL,
    `words_per_minute` DOUBLE NULL,
    `fillers_per_minute` DOUBLE NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `practice_sessions_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `practice_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_members` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('COACH', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `organization_members_user_id_idx`(`user_id`),
    UNIQUE INDEX `organization_members_organization_id_user_id_key`(`organization_id`, `user_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `organization_members_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `organization_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enquiries` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `organization` VARCHAR(191) NOT NULL,
    `size` INTEGER NULL,
    `message` VARCHAR(2000) NOT NULL DEFAULT '',
    `status` ENUM('NEW', 'CONTACTED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enquiries_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `company` VARCHAR(200) NOT NULL DEFAULT '',
    `job_title` VARCHAR(200) NOT NULL DEFAULT '',
    `resume_file_name` VARCHAR(255) NOT NULL DEFAULT '',
    `resume_chars` INTEGER NOT NULL DEFAULT 0,
    `answers_count` INTEGER NOT NULL DEFAULT 0,
    `stories_count` INTEGER NOT NULL DEFAULT 0,
    `storage` ENUM('DATABASE', 'S3') NOT NULL DEFAULT 'DATABASE',
    `data` LONGTEXT NULL,
    `storage_key` VARCHAR(300) NULL,
    `size_bytes` INTEGER NOT NULL DEFAULT 0,
    `resume_file_key` VARCHAR(300) NULL,
    `resume_file_type` VARCHAR(100) NULL,
    `device_name` VARCHAR(100) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_profiles_user_id_client_id_key`(`user_id`, `client_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_posts` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` VARCHAR(400) NOT NULL DEFAULT '',
    `body` MEDIUMTEXT NOT NULL,
    `tags` VARCHAR(300) NOT NULL DEFAULT '',
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `source` ENUM('ADMIN', 'AI') NOT NULL DEFAULT 'ADMIN',
    `author_id` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `blog_posts_slug_key`(`slug`),
    INDEX `blog_posts_status_published_at_idx`(`status`, `published_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `blog_posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `financial_year` VARCHAR(9) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `kind` ENUM('TAX_INVOICE', 'BILL') NOT NULL,
    `payment_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `seller_name` VARCHAR(200) NOT NULL,
    `seller_address` VARCHAR(500) NOT NULL DEFAULT '',
    `seller_state` VARCHAR(60) NOT NULL DEFAULT '',
    `seller_gstin` VARCHAR(15) NOT NULL DEFAULT '',
    `buyer_name` VARCHAR(200) NOT NULL,
    `buyer_email` VARCHAR(254) NOT NULL,
    `buyer_address` VARCHAR(500) NOT NULL DEFAULT '',
    `buyer_state` VARCHAR(60) NOT NULL DEFAULT '',
    `buyer_gstin` VARCHAR(15) NOT NULL DEFAULT '',
    `description` VARCHAR(300) NOT NULL,
    `sac_code` VARCHAR(10) NOT NULL DEFAULT '',
    `total_paise` INTEGER NOT NULL,
    `taxable_paise` INTEGER NOT NULL,
    `cgst_paise` INTEGER NOT NULL DEFAULT 0,
    `sgst_paise` INTEGER NOT NULL DEFAULT 0,
    `igst_paise` INTEGER NOT NULL DEFAULT 0,
    `gst_rate_basis_points` INTEGER NOT NULL DEFAULT 0,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `emailed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invoices_number_key`(`number`),
    UNIQUE INDEX `invoices_payment_id_key`(`payment_id`),
    INDEX `invoices_user_id_issued_at_idx`(`user_id`, `issued_at`),
    UNIQUE INDEX `invoices_financial_year_sequence_key`(`financial_year`, `sequence`),
    PRIMARY KEY (`id`),
    CONSTRAINT `invoices_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `invoices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `counters` (
    `key` VARCHAR(60) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_blocks` (
    `key` VARCHAR(60) NOT NULL,
    `data` MEDIUMTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_interviews` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `profile_client_id` VARCHAR(40) NOT NULL DEFAULT '',
    `notes` VARCHAR(1000) NOT NULL DEFAULT '',
    `reminded_day_at` DATETIME(3) NULL,
    `reminded_soon_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_interviews_starts_at_idx`(`starts_at`),
    UNIQUE INDEX `user_interviews_user_id_client_id_key`(`user_id`, `client_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `user_interviews_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_questions` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `category` ENUM('ABOUT_YOU', 'EXPERIENCE', 'CODING', 'SYSTEM_DESIGN', 'CONCEPT', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `daily_questions_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_answers` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `daily_question_id` VARCHAR(191) NOT NULL,
    `answer` TEXT NOT NULL,
    `score` INTEGER NULL,
    `feedback` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `daily_answers_user_id_daily_question_id_key`(`user_id`, `daily_question_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `daily_answers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `daily_answers_daily_question_id_fkey` FOREIGN KEY (`daily_question_id`) REFERENCES `daily_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `career_reports` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('RESUME_SCORE', 'RESUME_REWRITE', 'LINKEDIN_REVIEW', 'COVER_LETTER', 'INTERVIEWER_INSIGHTS', 'SALARY_PRACTICE') NOT NULL,
    `title` VARCHAR(200) NOT NULL DEFAULT '',
    `input` MEDIUMTEXT NULL,
    `result` MEDIUMTEXT NOT NULL,
    `score` INTEGER NULL,
    `model` VARCHAR(80) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `career_reports_user_id_kind_created_at_idx`(`user_id`, `kind`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `career_reports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ambassadors` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `college` VARCHAR(200) NOT NULL,
    `city` VARCHAR(100) NOT NULL DEFAULT '',
    `course` VARCHAR(200) NOT NULL DEFAULT '',
    `why` VARCHAR(1000) NOT NULL DEFAULT '',
    `status` ENUM('APPLIED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPLIED',
    `note` VARCHAR(1000) NOT NULL DEFAULT '',
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ambassadors_user_id_key`(`user_id`),
    INDEX `ambassadors_status_idx`(`status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ambassadors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `peer_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `host_id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NULL,
    `status` ENUM('WAITING', 'ACTIVE', 'ENDED') NOT NULL DEFAULT 'WAITING',
    `state` MEDIUMTEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `peer_rooms_code_key`(`code`),
    INDEX `peer_rooms_host_id_idx`(`host_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `peer_rooms_host_id_fkey` FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `peer_rooms_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `to` VARCHAR(20) NOT NULL,
    `template` VARCHAR(100) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `error` VARCHAR(1000) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
