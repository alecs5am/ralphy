# Studio object annotations and tags

> **Status:** todo
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** high
> **Category:** studio / agent-context / UX

## Context

The user clarified that Claude Code remains the orchestrator, while Studio is a visual control layer. Studio needs a lightweight way for the user to tag visible objects, mark winners or failures, and attach short notes without turning Studio into a full editor.

## What

Add a file-backed annotation layer for Studio-selected objects: runs, projects, workflow nodes, eval findings, artifacts, Units, and publish destinations. Tags should be a small controlled vocabulary plus a free-text note. The first version should write metadata only and never mutate media artifacts.

## Why it matters

The chat agent cannot reliably infer which thumbnail, eval finding, or node the user meant from prose alone. Durable annotations give Claude Code precise, inspectable context while preserving the current chat-first workflow.

## Scope / acceptance

- Add a schema for annotation records, stored append-only under the owning run or project, for example `annotations.jsonl`.
- Supported target types include `run`, `project`, `workflow_node`, `artifact`, `eval_finding`, `unit`, and `destination`.
- Support tags such as `winner`, `reject`, `needs-regeneration`, `weak-hook`, `style-drift`, `use-as-reference`, `approved`, `publish-ready`, and `template-candidate`.
- Studio UI can add, remove, and list annotations for visible objects.
- Existing artifact paths stay untouched; annotation writes are metadata-only.
- Studio API guards target paths against traversal and missing workspace/project roots.
- Add fixture-backed server tests plus a small UI smoke path for tagging an artifact.

## Notes

- Builds on #478, #480, and #482.
- Sequence before the agent context inbox issue, because selected objects need a durable identity before they can be sent back to chat.
