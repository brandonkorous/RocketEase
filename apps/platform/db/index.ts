import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as auth from "./schema/auth";
import * as app from "./schema/app";
import * as api from "./schema/api";
import * as scim from "./schema/scim";
import * as connections from "./schema/connections";
import * as assets from "./schema/assets";
import * as content from "./schema/content";
import * as approvals from "./schema/approvals";
import * as engagement from "./schema/engagement";
import * as analytics from "./schema/analytics";
import * as campaigns from "./schema/campaigns";
import * as telemetry from "./schema/telemetry";
import * as quality from "./schema/quality";
import * as recommendations from "./schema/recommendations";
import * as automations from "./schema/automations";
import * as tracking from "./schema/tracking";
import * as rights from "./schema/rights";
import * as hashtags from "./schema/hashtags";
import * as recycling from "./schema/recycling";

export const schema = { ...auth, ...app, ...api, ...scim, ...connections, ...assets, ...content, ...approvals, ...engagement, ...analytics, ...telemetry, ...quality, ...campaigns, ...recommendations, ...automations, ...tracking, ...hashtags, ...recycling, ...rights };

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// One pool per process; Next.js dev hot-reload re-evaluates modules, so cache on globalThis.
const globalForDb = globalThis as unknown as { __misSql?: ReturnType<typeof postgres> };
const sql = globalForDb.__misSql ?? postgres(url, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__misSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
