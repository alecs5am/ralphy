# Render on a fresh root hides the next project

> **Status:** todo
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** medium
> **Category:** bug / domain store

## Context

Found in #559 while building demo projects: on a fresh data root, `ralphy render` on the first project creates `ralphy.db`; a second project created in the same root afterwards fails with "Project not found". The demos worked around it with one root per project.

## What

Reproduce on a fresh temp root (HOME isolated), find whether the first render initializes the store without importing the registry-only projects (or the second project is created registry-only after the store exists), and make project creation and render consistent with the store being authoritative (#585 made compatibility verbs store-first).

## Scope / acceptance

- Integration test: fresh root, create project A, render A, create project B, render or show B succeeds.
- Fix in the creation or initialization path, not a workaround in tests.
