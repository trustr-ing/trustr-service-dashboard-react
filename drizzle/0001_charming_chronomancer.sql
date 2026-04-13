ALTER TABLE `saved_requests` ADD `config_data` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_requests` ADD `first_output_naddr` text;--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `privkey`;