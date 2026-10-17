-- Run connected to postgres, with live, replacement and retained psql variables.
-- The two renames and connection policy changes commit together.
\set ON_ERROR_STOP on
SELECT :'live' ~ '^finance_[a-z0-9_]+$' AND :'replacement' ~ '^finance_[a-z0-9_]+$'
  AND :'retained' ~ '^finance_[a-z0-9_]+$' AND :'live' <> :'replacement'
  AND :'live' <> :'retained' AND :'replacement' <> :'retained' AS valid_names \gset
\if :valid_names
BEGIN;
ALTER DATABASE :"live" ALLOW_CONNECTIONS false;
ALTER DATABASE :"replacement" ALLOW_CONNECTIONS false;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (:'live', :'replacement');
ALTER DATABASE :"live" RENAME TO :"retained";
ALTER DATABASE :"replacement" RENAME TO :"live";
ALTER DATABASE :"live" ALLOW_CONNECTIONS true;
COMMIT;
\else
\quit 2
\endif
