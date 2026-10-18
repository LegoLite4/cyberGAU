#!/usr/bin/env python3
import json
import sys


def scalar(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return '""'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def emit(obj, indent=0):
    sp = "  " * indent
    lines = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, dict):
                lines.append(f"{sp}{key}:")
                lines.extend(emit(value, indent + 1))
            elif isinstance(value, list):
                if not value:
                    lines.append(f"{sp}{key}: []")
                else:
                    lines.append(f"{sp}{key}:")
                    for item in value:
                        if isinstance(item, (dict, list)):
                            lines.append(f"{sp}-")
                            lines.extend(emit(item, indent + 1))
                        else:
                            lines.append(f"{sp}- {scalar(item)}")
            else:
                lines.append(f"{sp}{key}: {scalar(value)}")
    return lines


src, dst = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as handle:
    data = json.load(handle)

# Inject shared CS2 base into allowed_mounts at convert time (avoid empty `[]`
# followed by a post-edit list item, which breaks Wings YAML parsing).
import os

cs2_base = os.environ.get("CS2_BASE_DIR") or "/var/lib/cybergau/cs2-base"
mounts = data.get("allowed_mounts")
if not isinstance(mounts, list):
    mounts = []
if cs2_base not in mounts:
    mounts = list(mounts) + [cs2_base]
data["allowed_mounts"] = mounts

text = "\n".join(emit(data)) + "\n"
with open(dst, "w", encoding="utf-8") as handle:
    handle.write(text)
