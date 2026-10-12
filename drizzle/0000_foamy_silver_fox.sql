CREATE TABLE `visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`visited_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visits_recent` ON `visits` (`visited_at`);--> statement-breakpoint
CREATE INDEX `visits_dedup` ON `visits` (`user_id`,`path`,`visited_at`);