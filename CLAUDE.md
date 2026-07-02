# Outerbound — Personal Outbound Email OS

Personal single-user tool. NOT a SaaS, NOT commercial, NOT multi-user.

## Rules

- If there are multiple valid implementations, always choose the simplest solution that is reliable and easy to maintain. Optimize for daily productivity of one user, not scalability or enterprise use cases.
- Keep everything simple. No over-engineering, no premature abstractions, no enterprise patterns.
- Prefer fewer files, reusable components, existing code over new code. Never duplicate code.
- If a reusable component already exists, extend it instead of creating a new one. Before creating a new component, verify an existing one cannot be adapted. Minimize the number of new files.
- Implement ONLY the requested task. Never regenerate, rewrite, or refactor unrelated code. Output only changed files.
- If a task is too large, split into steps, complete Step 1 only, then stop.
- Never decide the roadmap. Wait for the next task.

## Tech Stack

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, IndexedDB, React Hook Form, Zod, Papa Parse, Nodemailer.

## Modules (nothing else)

Dashboard, Import, Leads, Templates, Campaigns, SMTP, Queue, Inbox, Reports, Settings.

## Workflow per task

1. Analyze existing code.
2. Implement only the requested feature.
3. Integrate with existing code.
4. Run `npm run lint`, `npm run typecheck`, `npm run build` — fix issues.
5. Self-review; implement improvements only if inside current task scope.

## Output format

Files Changed • Short Summary • Anything requiring attention. Nothing else.
