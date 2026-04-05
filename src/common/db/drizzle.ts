import type Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/index.js'

export type DrizzleDb = BetterSQLite3Database<typeof schema>

export const createDrizzleDb = (db: InstanceType<typeof Database>): DrizzleDb => drizzle(db, { schema })
