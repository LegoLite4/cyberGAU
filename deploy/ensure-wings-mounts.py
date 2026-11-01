#!/usr/bin/env python3
"""Ensure Wings config.yml has a valid allowed_mounts list.

Never leave root-level `- path` lines (breaks YAML block mapping) and never
keep `allowed_mounts: []` followed by dangling list items.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


MOUNT_ITEM = re.compile(r"^([ \t]*)-\s+(.+?)\s*$")
ALLOWED_EMPTY = re.compile(r"^allowed_mounts:\s*\[\s*\]\s*$")
ALLOWED_KEY = re.compile(r"^allowed_mounts:\s*$")
ALLOWED_FLOW = re.compile(r"^allowed_mounts:\s*\[(.*)\]\s*$")


def parse_item(raw: str) -> str:
    return raw.strip().strip('"').strip("'")


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

        # Flow empty / non-empty: allowed_mounts: []  or  allowed_mounts: ["a"]
        mflow = ALLOWED_FLOW.match(ln)
        if mflow:
            inner = mflow.group(1).strip()
            if inner:
                for part in inner.split(","):
                    item = parse_item(part)
                    if item and item not in mounts:
                        mounts.append(item)
            i += 1
            # Also swallow following indented (or root) list items left by broken editors
            while i < len(lines) and MOUNT_ITEM.match(lines[i]):
                item = parse_item(MOUNT_ITEM.match(lines[i]).group(2))
                if item and item not in mounts:
                    mounts.append(item)
                i += 1
            continue

        if ALLOWED_KEY.match(ln) or ALLOWED_EMPTY.match(ln):
            i += 1
            while i < len(lines) and MOUNT_ITEM.match(lines[i]):
                item = parse_item(MOUNT_ITEM.match(lines[i]).group(2))
                if item and item not in mounts:
                    mounts.append(item)
                i += 1
            continue

        # Stray root-level mount list item (column 0) — never keep as mapping sibling
        mitem = MOUNT_ITEM.match(ln)
        if mitem and mitem.group(1) == "":
            item = parse_item(mitem.group(2))
            if item.startswith("/") and item not in mounts:
                mounts.append(item)
            i += 1
            continue

        out.append(ln)
        i += 1

    if mount not in mounts:
        mounts.append(mount)

    block = ["allowed_mounts:"] + [f'  - "{m}"' for m in mounts]
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

    text = "\n".join(final).rstrip() + "\n"
    path.write_text(text, encoding="utf-8")

    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            raise ValueError("config root is not a mapping")
        am = data.get("allowed_mounts")
        if not isinstance(am, list) or mount not in [str(x) for x in am]:
            raise ValueError(f"allowed_mounts missing {mount}: {am!r}")
        # No accidental root list
        if any(isinstance(v, list) and k is None for k, v in [(None, None)]):
            pass
    except ImportError:
        if re.search(r"^allowed_mounts:\s*\[\s*\]\s*$", text, re.M):
            print("allowed_mounts still empty array", file=sys.stderr)
            return 1
        if f'- "{mount}"' not in text and f"- {mount}" not in text:
            print(f"mount path not found: {mount}", file=sys.stderr)
            return 1
        if re.search(r"^-\s+/", text, re.M):
            print("stray root-level list item remains", file=sys.stderr)
            return 1

    print(f"allowed_mounts ok ({mount})")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ensure-wings-mounts failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
