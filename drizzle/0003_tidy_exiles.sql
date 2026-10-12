CREATE TABLE `traffic_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`next_attempt` integer NOT NULL,
	`status` text NOT NULL
);
