#!/usr/bin/env python3
"""Wrapper to run backend/scripts/fake_shop.py from workspace root."""
import os
import sys

target = os.path.join(os.path.dirname(__file__), "..", "backend", "scripts", "fake_shop.py")
if not os.path.exists(target):
    target = os.path.join(os.path.dirname(__file__), "backend", "scripts", "fake_shop.py")

with open(target, "rb") as f:
    code = compile(f.read(), target, "exec")
    exec(code, globals())
