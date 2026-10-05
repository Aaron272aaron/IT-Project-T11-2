#!/usr/bin/env python3
"""Manage the local Task 39 PostgreSQL database using Docker Compose."""

import argparse
import datetime
import os
import pathlib
import re
import secrets
import subprocess
import sys


DIRECTORY = pathlib.Path(__file__).resolve().parent
PROJECT = DIRECTORY.parent
ENV_FILE = DIRECTORY / ".env"


def compose(*arguments: str, **kwargs) -> subprocess.CompletedProcess:
    """Run Compose without exposing connection passwords in arguments."""
    return subprocess.run(
        ["docker", "compose", "--project-directory", str(PROJECT),
         "--env-file", str(ENV_FILE), "-f", str(PROJECT / "compose.yaml"),
         *arguments], check=True, **kwargs,
    )


def create_environment() -> None:
    """Create credentials once; restarting never rotates a persisted password."""
    if ENV_FILE.exists():
        return
    descriptor = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        for name in ("POSTGRES_PASSWORD", "APP_PASSWORD", "WORKER_PASSWORD"):
            output.write(f"{name}={secrets.token_hex(24)}\n")
        output.write("DATABASE_PORT=5432\n")


def sql(database: str, statement: str) -> str:
    """Run administrator SQL inside the container; return its output locally."""
    result = compose(
        "exec", "-T", "database", "psql", "-X", "-U", "postgres",
        "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq",
        input=statement, text=True, capture_output=True,
    )
    return result.stdout.strip()


def apply_file(database: str, path: pathlib.Path) -> None:
    """Apply SQL with immediate failure on any error."""
    compose(
        "exec", "-T", "database", "psql", "-X", "-U", "postgres",
        "-d", database, "-v", "ON_ERROR_STOP=1", "-f", "-",
        input=path.read_text(), text=True,
    )


def check_database_name(name: str) -> str:
    """Accept a simple identifier before using it in database administration."""
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", name):
        raise ValueError("Use a database name containing lowercase letters/numbers/_")
    return name


def start() -> None:
    """Start PostgreSQL and verify schema initialization, not just the process."""
    create_environment()
    compose("up", "-d", "--wait", "--wait-timeout", "90", "database")
    count = sql("automark", "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'automark' AND table_type = 'BASE TABLE';")
    if int(count) != 11:
        raise ValueError("Database initialization is incomplete; inspect Docker logs")
    print(f"PostgreSQL is ready: automark, schema automark, {count} tables.")
    print("Connection instructions: database/README.md")


def test_database() -> None:
    """Test a new disposable database, leaving the working database untouched."""
    name = f"automark_test_{secrets.token_hex(6)}"
    recovered = f"automark_recovery_{secrets.token_hex(6)}"
    recovery_created = False
    sql("postgres", f'CREATE DATABASE "{name}";')
    try:
        apply_file(name, DIRECTORY / "schema.sql")
        apply_file(name, DIRECTORY / "tests.sql")
        # Parallel sessions compete for an answer, rather than testing sequentially.
        sessions = []
        for tutor in (1, 2):
            command = [
                "docker", "compose", "--project-directory", str(PROJECT),
                "--env-file", str(ENV_FILE), "-f", str(PROJECT / "compose.yaml"),
                "exec", "-T", "database", "psql", "-X", "-U", "postgres",
                "-d", name, "-v", "ON_ERROR_STOP=1", "-Atq",
            ]
            process = subprocess.Popen(
                command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True,
            )
            process.stdin.write(
                f"BEGIN; SET LOCAL ROLE automark_app; "
                f"SELECT automark.claim_answer(2, {tutor}); "
                "SELECT pg_sleep(0.5); COMMIT;\n"
            )
            process.stdin.close()
            process.stdin = None
            sessions.append(process)
        results = []
        for process in sessions:
            output, error = process.communicate(timeout=20)
            if process.returncode:
                raise RuntimeError(error)
            results.append(output.strip())
        if sorted(results) != ["f", "t"]:
            raise ValueError("Concurrent claim test failed")
        owner = sql(name, "SELECT locked_by FROM automark.answers WHERE id = 2;")
        # Same tutor, two browser tabs: only one save may use version zero.
        def save() -> subprocess.Popen:
            command = [
                "docker", "compose", "--project-directory", str(PROJECT),
                "--env-file", str(ENV_FILE), "-f", str(PROJECT / "compose.yaml"),
                "exec", "-T", "database", "psql", "-X", "-U", "postgres",
                "-d", name, "-v", "ON_ERROR_STOP=1", "-Atq",
            ]
            process = subprocess.Popen(
                command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True,
            )
            process.stdin.write(
                f"SET ROLE automark_app; SELECT automark.save_mark(2, {owner}, "
                "3, 'Synthetic concurrency test', 'draft', 0);\n"
            )
            process.stdin.close()
            process.stdin = None
            return process
        saves = [save(), save()]
        outcomes = [process.communicate(timeout=20) for process in saves]
        if sorted(process.returncode for process in saves) != [0, 3]:
            raise ValueError("Concurrent stale-save test failed")
        if not any("Mark changed; reload" in error for _, error in outcomes):
            raise ValueError("Expected stale-save rejection was missing")
        print("PASS: concurrent claims and stale saves; one winner in each race.")
        archive = compose(
            "exec", "-T", "database", "pg_dump", "-U", "postgres",
            "-d", name, "-Fc", "--no-owner", "--no-acl", capture_output=True,
        ).stdout
        sql("postgres", f'CREATE DATABASE "{recovered}";')
        recovery_created = True
        compose(
            "exec", "-T", "database", "pg_restore", "-U", "postgres",
            "-d", recovered, "--exit-on-error", "--single-transaction",
            "--no-owner", "--no-acl", input=archive,
        )
        for table in ("answers", "marks", "mark_history", "ai_reviews",
                      "automated_results", "answer_group_members"):
            query = f"SELECT jsonb_agg(t ORDER BY id) FROM automark.{table} t;"
            if sql(name, query) != sql(recovered, query):
                raise ValueError(f"Backup round-trip mismatch: {table}")
        print("PASS: backup restores originals, marks, history, AI, tests and groups.")
        print("All database checks passed. No test records added to automark.")
    finally:
        if recovery_created:
            sql("postgres", f'DROP DATABASE "{recovered}";')
        sql("postgres", f'DROP DATABASE "{name}";')


def backup() -> None:
    """Write and validate a new local archive before publishing its filename."""
    destination = DIRECTORY / "backups"
    destination.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    final = destination / f"automark_{stamp}_{secrets.token_hex(3)}.dump"
    temporary = final.with_suffix(".partial")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            compose("exec", "-T", "database", "pg_dump", "-U", "postgres",
                    "-d", "automark", "-Fc", "--no-owner", "--no-acl", stdout=output)
        with temporary.open("rb") as archive:
            compose("exec", "-T", "database", "pg_restore", "--list",
                    stdin=archive, stdout=subprocess.DEVNULL)
        temporary.rename(final)
    except (OSError, subprocess.CalledProcessError):
        temporary.unlink(missing_ok=True)
        raise
    print(f"Validated local backup: {final}")


def restore(path: pathlib.Path, database: str) -> None:
    """Restore into a new database; never replace the active database."""
    name = check_database_name(database)
    if not path.is_file():
        raise ValueError("Backup file does not exist")
    with path.open("rb") as archive:
        compose("exec", "-T", "database", "pg_restore", "--list",
                stdin=archive, stdout=subprocess.DEVNULL)
    sql("postgres", f'CREATE DATABASE "{name}";')
    with path.open("rb") as archive:
        compose("exec", "-T", "database", "pg_restore", "-U", "postgres",
                "-d", name, "--exit-on-error", "--single-transaction",
                "--no-owner", "--no-acl", stdin=archive)
    # Archives exclude grants; restore the exact role grants from this migration.
    schema = (DIRECTORY / "schema.sql").read_text()
    grants = schema[schema.index("REVOKE ALL ON ALL FUNCTIONS"):]
    sql(name, "BEGIN;\n" + grants)
    print(f"Backup restored to {name}. Active database automark was unchanged.")


def main() -> None:
    """Dispatch database operations with concise failure messages."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("start", "stop", "status", "test", "backup"):
        commands.add_parser(command)
    restore_parser = commands.add_parser("restore")
    restore_parser.add_argument("archive", type=pathlib.Path)
    restore_parser.add_argument("--database", required=True)
    args = parser.parse_args()
    try:
        if args.command == "start":
            start()
        elif not ENV_FILE.exists():
            raise ValueError("Run python3 database/manage.py start first")
        elif args.command == "stop":
            compose("stop", "database")
        elif args.command == "status":
            compose("ps", "database")
        elif args.command == "test":
            test_database()
        elif args.command == "backup":
            backup()
        elif args.command == "restore":
            restore(args.archive, args.database)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Database operation failed: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
