"""Device-owner recovery: python3 -m backend.scripts.manage_accounts reset."""
import argparse
from getpass import getpass
from backend.security.accounts import AccountStore, AccountError, _email, _password, _hash_password


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["reset"])
    parser.add_argument("--email")
    args = parser.parse_args()
    try:
        email = _email(args.email or input("Account email: "))
        password = _password(getpass("New password (12–128 characters): "))
        if password != getpass("Confirm new password: "):
            raise AccountError("The passwords do not match.")
        store = AccountStore()
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id FROM accounts WHERE email=?", (email,)).fetchone()
            if not row:
                raise AccountError("That account does not exist.")
            store._replace_password(db, row[0], _hash_password(password))
        print("Password changed. All account sessions were revoked.")
    except (AccountError, EOFError, KeyboardInterrupt) as error:
        parser.exit(1, f"Recovery stopped: {error}\n")


if __name__ == "__main__":
    main()
