#!/usr/bin/env python3
"""Open the local database using DBeaver's documented command-line interface."""

import argparse
import pathlib
import subprocess
import sys


def main() -> None:
    """Pass local credentials by a private variables file, not process arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--executable", type=pathlib.Path,
        default=pathlib.Path("/Applications/DBeaver.app/Contents/MacOS/dbeaver"),
        help="DBeaver executable; override on Windows/Linux",
    )
    parser.add_argument(
        "--create", action="store_true",
        help="Create the connection on this machine's first setup only",
    )
    args = parser.parse_args()
    directory = pathlib.Path(__file__).resolve().parent
    environment = directory / ".env"
    if not environment.is_file() or not args.executable.is_file():
        parser.error("Install DBeaver and run database/manage.py start first")
    create = "true" if args.create else "false"
    connection = (
        "name=AutoMark Local|driver=postgresql|host=127.0.0.1|"
        "port=${DATABASE_PORT}|database=automark|user=automark_app|"
        "password=${APP_PASSWORD}|savePassword=false|"
        f"create={create}|save=true|connect=true"
    )
    try:
        subprocess.run(
            [str(args.executable), "-vars", str(environment),
             "-con", connection, "-bringToFront"], check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Could not open DBeaver: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
