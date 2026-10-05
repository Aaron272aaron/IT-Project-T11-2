-- psql reads container environment variables and safely quotes their values.
-- Used only during initialization; this file contains no passwords.
\getenv app_password APP_PASSWORD
\getenv worker_password WORKER_PASSWORD
SELECT format('CREATE ROLE automark_app LOGIN PASSWORD %L', :'app_password')
\gexec
SELECT format('CREATE ROLE automark_worker LOGIN PASSWORD %L', :'worker_password')
\gexec
