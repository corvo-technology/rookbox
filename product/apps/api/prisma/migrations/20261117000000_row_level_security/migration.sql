-- Row-level security for the product database.
--
-- Migrations keep running as the owner login (DATABASE_MIGRATION_URL). The API connects as a
-- LOGIN member of the group role rookbox_app: DML on the app tables only, no CREATE on the schema,
-- no access to _prisma_migrations, no superuser, no BYPASSRLS. The provisioning step that runs
-- after the migrations (src/provision.ts) creates that login from DATABASE_URL and grants the
-- group role its table privileges, on every start, so tables added later are covered too.
--
-- Table owners and superusers bypass policies. RLS is deliberately NOT forced: the owner must keep
-- migrating, and an install that has not split the logins yet (one URL for both) keeps working.
-- The API warns at start when its login bypasses RLS.
--
-- The policies read two TRANSACTION-LOCAL settings that the API sets as the first statement of
-- each transaction (set_config(..., true); the managed database sits behind a transaction-mode
-- pooler, so session-level settings are unsafe):
--   app.user_id     the signed-in user, for rows that user owns;
--   app.rls_bypass  'on' for named system work (sign-in, key lookup, operator tools, ingest).
-- With neither setting a query sees no rows and a write is rejected.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rookbox_app') THEN
    BEGIN
      CREATE ROLE rookbox_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'Cannot create role rookbox_app (the migration role lacks CREATEROLE). Create it NOLOGIN NOBYPASSRLS yourself; until then the app must connect as the owner and row-level security is not enforced.';
    END;
  END IF;
END $$;

-- PostgreSQL 15+ already denies this; older servers let every role create objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Owned by one user: the user sees and writes only their own rows (the check is the same
-- expression, so inserting a row for someone else is rejected). System work sees all.
ALTER TABLE "machine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY machine_tenant ON "machine"
  USING ("ownerId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY machine_system ON "machine"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_key_tenant ON "api_key"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY api_key_system ON "api_key"
  USING (current_setting('app.rls_bypass', true) = 'on');

-- A user may read their own usage; the rows are written by the ingest (system) only.
ALTER TABLE "usage_interval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_interval_tenant ON "usage_interval" FOR SELECT
  USING ("ownerUserId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY usage_interval_system ON "usage_interval"
  USING (current_setting('app.rls_bypass', true) = 'on');

-- A user may read their own account row (never write it).
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tenant ON "user" FOR SELECT
  USING ("id" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY user_system ON "user"
  USING (current_setting('app.rls_bypass', true) = 'on');

-- System only: credentials and tokens (sessions, password hashes, one-time values), the usage
-- reporter's own data, and the operator's waitlist. No tenant policy, so a user context sees nothing.
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_system ON "session"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_system ON "account"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_system ON "verification"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "usage_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_event_system ON "usage_event"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "usage_reporter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_reporter_system ON "usage_reporter"
  USING (current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "waitlist_entry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY waitlist_entry_system ON "waitlist_entry"
  USING (current_setting('app.rls_bypass', true) = 'on');
