"""Provision an administrator locally without storing its password in source or configuration."""
import getpass
import re
import sys

from . import db
from .auth import hash_pw


def main():
    username = input("Username [adminvakochat]: ").strip().lower() or "adminvakochat"
    if not re.fullmatch(r"[a-z0-9_.-]{3,32}", username):
        sys.exit("Username must be 3-32 letters, numbers, dots, underscores, or hyphens.")

    display_name = input("Display name [Admin Vakochat]: ").strip() or "Admin Vakochat"
    if not 1 <= len(display_name) <= 48:
        sys.exit("Display name must be 1-48 characters.")

    password = getpass.getpass("Password: ")
    if not 8 <= len(password.encode()) <= 72:
        sys.exit("Password must be between 8 and 72 bytes.")
    if password != getpass.getpass("Confirm password: "):
        sys.exit("Passwords do not match.")

    db.init_db()
    if db.get_user_by_name(username):
        sys.exit("That username already exists; promote it from the Admin dashboard instead.")

    uid = db.create_user(username, display_name, hash_pw(password), is_admin=True)
    db.record_audit(uid, "admin.account_provisioned", uid)
    print(f"Administrator account '{username}' created.")


if __name__ == "__main__":
    main()
