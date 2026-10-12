import {sqliteTable, integer, text, index} from 'drizzle-orm/sqlite-core';
export const visits=sqliteTable('visits',{
 id:integer('id').primaryKey({autoIncrement:true}),userId:text('user_id').notNull(),email:text('email').notNull(),name:text('name').notNull(),path:text('path').notNull(),ip:text('ip'),visitedAt:integer('visited_at').notNull()
},t=>[index('visits_recent').on(t.visitedAt),index('visits_dedup').on(t.userId,t.path,t.visitedAt)]);
export const passwordAttempts=sqliteTable('password_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const trafficCache=sqliteTable('traffic_cache',{id:integer('id').primaryKey(),payload:text('payload').notNull(),fetchedAt:integer('fetched_at').notNull(),nextAttempt:integer('next_attempt').notNull(),status:text('status').notNull()});
