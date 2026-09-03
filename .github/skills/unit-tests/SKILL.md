---
name: unit-tests
description: 'Create or improve repository-aware unit tests that verify behavior through public interfaces, not implementation details. Use when adding tests for hooks, components, route handlers, middleware, and modules in this codebase.'
argument-hint: 'Provide: exact target interface and top 2-4 behaviors to prioritize'
user-invocable: true
---

# Repository-Aware Unit Tests

Create concise, behavior-dense tests for this repository.

## Primary Goal

- Verify externally visible behavior through public interfaces.
- Keep tests stable across internal refactors when behavior is unchanged.

## When To Use

- The user asks to add, update, or improve tests in this repository.
- A test suite exists but behavior coverage is unclear, weak, or too implementation-coupled.
- Todo tests need to be replaced with complete behavior tests.

## Inputs

- Exact test target: file and public interface (exported function, hook, component, route handler, middleware, or module).
- Priority behaviors: top outcomes that matter most.

If the target is not explicit enough to locate code, ask first:

- What exact file or public interface should be tested?
- Which behaviors matter most?

Do not write tests before the target is explicit.

## Required Workflow

1. Identify exact target.
2. Inspect target implementation and nearby tests.
3. Produce a behavior-only plan and stop for approval.
4. Write or update tests only after approval.
5. Run relevant tests.
6. Summarize covered and omitted behaviors plus residual risk.

### Approval Gate Format

Use this exact structure before writing tests:

Plan

- I reviewed the target and identified the main externally visible behaviors.
- Below is the proposed behavior scope for the tests.

Behaviours to test

1. ...
2. ...
3. ...

Approval

- Confirm these are the behaviours you want covered before I write or update the tests.

If the user did not prioritize behavior scope, propose a focused top 2-4 behavior set and ask the user to confirm or edit priorities before test writing.

## Testing Principles

- Test behavior through public interfaces only.
- Prefer integration-style unit tests that exercise real code paths within the unit boundary.
- Mock only true boundaries: framework APIs, network, storage, time, environment, external services.
- Do not test private helpers, internal wiring, or refactor-sensitive details unless they are public contract.
- Avoid tests that fail only because internals were renamed, reordered, or moved.
- Use specification-style names, usually in "should ..." form.

## Repository Conventions

- Reuse current repo patterns:
  - top-level `jest.mock` for external boundaries
  - `beforeEach` with `jest.clearAllMocks()` and sensible default mock returns
  - local fixture factories via small TestUtils helpers when useful
  - `renderHook`, `act`, `waitFor` for hook behavior
  - direct invocation of exported route and middleware handlers for API/session flows
- Prefer extending an existing test file for the target.
- Replace relevant `it.todo`/`test.todo` placeholders with complete behavior tests.
- Do not leave `it.todo`, `test.todo`, `it.skip`, or `test.skip` unless explicitly requested.

## Coverage Guidance

- Focus on critical paths, business branching, session handling, and complex state transitions.
- Avoid exhaustive edge-case expansion.
- Avoid redundant tests; each test should defend a distinct invariant.

## Mutation-Safe and Concurrency-Sensitive Scenarios

When relevant, cover externally visible invariants for async and concurrent behavior:

- latest valid selection becomes active when prior selection disappears
- local draft state resyncs when authoritative data changes
- aborted async flows stop cleanly without committing success
- non-abort failures surface correctly
- session refresh updates last activity while preserving session start
- idle and absolute timeout boundaries behave correctly
- repeated or reordered async updates do not leave public state inconsistent

## What To Avoid

- Assertions on private implementation details.
- Over-mocking internal modules inside the unit boundary.
- Tests centered on helper call counts, exact internal sequencing, or incidental query-key construction unless that value is the public contract.

## Execution Notes

- Keep the suite concise and behavior-dense.
- Use this repository's strongest style references:
  - `__tests__/lib/hooks/useMeetings.test.ts`
  - `__tests__/lib/hooks/useConversationHistory.test.ts`
  - `__tests__/lib/hooks/useChatSSE.test.ts`
  - `__tests__/middleware.test.ts`
  - `__tests__/app/api/security/heartbeat/route.test.ts`

## Output Contract After Approved Test Changes

Briefly report:

- behaviors covered
- deliberately omitted behaviors
- remaining risk or untested area
