#!/usr/bin/env python3
"""Ensure Wings config.yml has a valid allowed_mounts list (never `[]` + dangling `- item`)."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "usage: ensure-wings-mounts.py /etc/pterodactyl/config.yml [mount_path]",
            file=sys.stderr,
        )
        return 2

    path = Path(sys.argv[1])
    mount = sys.argv[2] if len(sys.argv) > 2 else (
        os.environ.get("CS2_BASE_DIR") or "/var/lib/cybergau/cs2-base"
    )
    lines = path.read_text(encoding="utf-8").splitlines()

    mounts: list[str] = []
    out: list[str] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        # allowed_mounts: []  OR  allowed_mounts:
        if re.match(r"^allowed_mounts:\s*\[\s*\]\s*$", ln):
            # Broken form often followed by indented list items — collect then drop key.
            i += 1
            while i < len(lines) and re.match(r"^[ \t]+-", lines[i]):
                item = lines[i].lstrip()[1:].strip().strip('"').strip("'")
                if item and item not in mounts:
                    mounts.append(item)
                i += 1
            continue
        if re.match(r"^allowed_mounts:\s*$", ln):
            i += 1
            while i < len(lines) and re.match(r"^[ \t]+-", lines[i]):
                item = lines[i].lstrip()[1:].strip().strip('"').strip("'")
                if item and item not in mounts:
                    mounts.append(item)
                i += 1
            continue
        out.append(ln)
        i += 1

    if mount not in mounts:
        mounts.append(mount)

    block = ["allowed_mounts:"] + [f"  - {m}" for m in mounts]
    final: list[str] = []
    inserted = False
    for ln in out:
        if not inserted and re.match(r"^remote:\s*", ln):
            final.extend(block)
            inserted = True
        final.append(ln)
    if not inserted:
        if final and final[-1].strip():
            final.append("")
        final.extend(block)

    path.write_text("\n".join(final).rstrip() + "\n", encoding="utf-8")

    try:
        import yaml  # type: ignore

        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("config root is not a mapping")
        am = data.get("allowed_mounts")
        if not isinstance(am, list) or mount not in [str(x) for x in am]:
            raise ValueError(f"allowed_mounts missing {mount}: {am!r}")
    except ImportError:
        body = path.read_text(encoding="utf-8")
        if re.search(r"^allowed_mounts:\s*\[\s*\]\s*$", body, re.M):
            print("allowed_mounts still empty array", file=sys.stderr)
            return 1
        if f"- {mount}" not in body:
            print(f"mount path not found: {mount}", file=sys.stderr)
            return 1

    print(f"allowed_mounts ok ({mount})")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ensure-wings-mounts failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
