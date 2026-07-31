"""Generate a fresh Apple Music developer token (JWT, ES256) from a MusicKit .p8 key.

Apple Music developer tokens expire after at most 6 months. When the extractor
starts returning 401s / "API returned no rows", regenerate the token here and
paste it into backend/.env as APPLE_DEVELOPER_TOKEN.

Usage:
    python generate_apple_token.py /path/to/AuthKey_XXXXXXXXXX.p8 \
        --kid UZ5GBQF46S --team 6CMYF6J89W

Defaults for --kid / --team match the existing key so you can usually just pass
the .p8 path. Pass --write to update backend/.env in place.
"""
import argparse
import time
from pathlib import Path

import jwt  # PyJWT

# Existing values for this project's MusicKit key. Override with --kid/--team if
# you create a NEW key in the Apple Developer portal.
DEFAULT_KID = "923663T92D"   # Key ID (matches AuthKey_923663T92D.p8)
DEFAULT_TEAM = "6CMYF6J89W"  # Team ID (issuer)

# Apple allows up to 6 months; use 180 days to stay safely under the limit.
LIFETIME_SECONDS = 180 * 24 * 60 * 60


def make_token(p8_path: str, kid: str, team: str) -> tuple[str, int]:
    private_key = Path(p8_path).read_text()
    iat = int(time.time())
    exp = iat + LIFETIME_SECONDS
    token = jwt.encode(
        {"iss": team, "iat": iat, "exp": exp},
        private_key,
        algorithm="ES256",
        headers={"alg": "ES256", "kid": kid},
    )
    return token, exp


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate an Apple Music developer token")
    ap.add_argument("p8", help="Path to the MusicKit .p8 private key file")
    ap.add_argument("--kid", default=DEFAULT_KID, help=f"Key ID (default {DEFAULT_KID})")
    ap.add_argument("--team", default=DEFAULT_TEAM, help=f"Team ID / issuer (default {DEFAULT_TEAM})")
    ap.add_argument("--write", action="store_true", help="Update APPLE_DEVELOPER_TOKEN in backend/.env")
    args = ap.parse_args()

    token, exp = make_token(args.p8, args.kid, args.team)
    exp_str = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(exp))

    print("\nNew Apple Music developer token (valid until %s):\n" % exp_str)
    print(token)

    if args.write:
        env_path = Path(__file__).parent / ".env"
        lines = env_path.read_text().splitlines()
        out, replaced = [], False
        for line in lines:
            if line.startswith("APPLE_DEVELOPER_TOKEN="):
                out.append(f"APPLE_DEVELOPER_TOKEN={token}")
                replaced = True
            else:
                out.append(line)
        if not replaced:
            out.append(f"APPLE_DEVELOPER_TOKEN={token}")
        env_path.write_text("\n".join(out) + "\n")
        print(f"\nUpdated {env_path} (APPLE_DEVELOPER_TOKEN). "
              "Recreate the backend container to load it:\n"
              "    sudo docker compose up -d --build backend")


if __name__ == "__main__":
    main()
