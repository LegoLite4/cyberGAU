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
text = "\n".join(emit(data)) + "\n"
with open(dst, "w", encoding="utf-8") as handle:
    handle.write(text)
