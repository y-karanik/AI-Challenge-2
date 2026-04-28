# Task 1 Report

## Approach

I built a fully static leaderboard page using plain HTML, CSS, and JavaScript — no frameworks, no backend. The implementation was done with an AI-enhanced IDE (GitHub Copilot in VS Code), using iterative prompting to generate the layout, styles, and data logic, then refining each part by reviewing the output against the internal company leaderboard.

## Tools and Techniques

GitHub Copilot Chat (agentic mode) was used throughout: for scaffolding the HTML structure, writing CSS with responsive breakpoints, and generating the JavaScript data model and rendering logic. Prompts were refined iteratively — describing desired visual behavior, identifying gaps against the reference, and asking for targeted fixes. All filtering, sorting, and expand/collapse behavior is implemented client-side in vanilla JS.

## Data Replacement

The original leaderboard data was replaced entirely with synthetic content generated in-browser at runtime. Participant names are drawn from a pool of gender-neutral fictional names. Roles, department codes, and country codes are randomly assigned from predefined lists. Activity descriptions are generated from role-specific templates (separate sets for engineers, QA, data analysts, product managers, etc.) using a deterministic hash function to ensure consistent output across page loads. No real names, photos, titles, or any personal or corporate data were used.
