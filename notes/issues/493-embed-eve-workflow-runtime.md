# Embed Eve as the workflow app's agent runtime

> **Status:** todo
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** high
> **Category:** agents / workflow / runtime

## Context

The user wants the workflow app to contain Eve. In this model, Eve is not a replacement for Ralphy state or Studio UI. It is the durable agent/workflow runtime inside the app, while Claude Code drives the app through the local API during the current phase.

## What

Build a contained Eve integration spike inside the workflow app. Eve should run as an internal runtime with typed tools that call the workflow-app API or ralphy primitives. Claude Code can start, inspect, and resume Eve-backed workflow sessions through the app API.

## Why it matters

This is the path from "Claude Code manually orchestrates the farm" to "the app can run durable workflows itself." Eve brings sessions, human-in-the-loop pauses, subagents, schedules, and stream events, but Ralphy must keep ownership of media/project/workspace state.

## Scope / acceptance

- Create an experimental Eve app or package under an isolated path such as `experiments/eve-workflow-app/` or a clearly named package.
- Add a minimal Eve agent with tools that wrap the workflow-app API: show run, get workflow graph, create inbox item, request approval, apply approved config patch, and resume next action.
- Add one Eve session flow that pauses for approval and resumes without losing run context.
- Mirror Eve session/run events into Ralphy run events or a fixture projection that Studio can read.
- Ensure Eve tools do not call model/media providers directly; model/media work still goes through Ralphy-approved provider layers.
- Document any required invariant decision before adopting Vercel-hosted services, AI Gateway, or workflow worlds in production.
- Keep the spike optional and non-blocking for the current Claude Code orchestrator path.

## Notes

- Sequence after #492 so Eve has a stable API to call.
- This issue is a spike, not a mandate to replace the existing workflow/run state model.
