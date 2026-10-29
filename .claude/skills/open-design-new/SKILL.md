---
name: "open-design-new"
description: Start a new design by picking what to make (prototype, mobile app, slides, document, wireframe, animation, résumé, research, data report, poster, social post, diagram), then build it with the right recipe
argument-hint: what to make, optionally followed by the brief (e.g. "a wireframe of onboarding for a budgeting app")
---

<!-- generated:curated-entry -->

Start a new design with Open Design.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "What do you want to make, and what is it for?")

**How to talk to the user.** Many people using Open Design don't write code, so:
- Use the user's own words. If they say "artifact", "design tokens" or give a file path, use those terms back; otherwise use the plain words below.
- Keep the machinery out of replies: no tool names, no ids like `od:prototype:poster-hero`, no internal files (`.artifact.json`, `.comments.json`, `config.json`), and not the words "register", "manifest", "sidecar", "entry" or "surface", unless the user used them first.
- Explain a print term the first time it comes up, in one short clause, and not again.
- Say where a file is the way the user would find it ("in your Open Design folder, under seed-swap-flyer"). Give a raw path only where the user can click it (Claude Code, Claude Desktop's Code tab, VS Code) or asks for it.
- End each reply that finishes a step with one line on what they can do next, with at most two options ("Want it in Instagram sizes too, or is it ready to print?").

| Instead of | Say |
|---|---|
| artifact, entry, registered | your design, saved |
| design system, active design system | your style (the first time: "a saved style: colours, fonts and spacing") |
| surface, skill, template, recipe | kind of design, starting layout, or nothing |
| workspace, output directory | your folder, your Open Design folder |
| bleed | print edge ("a few millimetres extra that the printer trims off") |
| trim size | final size |
| preflight findings, errors | "I checked it and fixed…", "one thing to look at:" |
| export | save as PDF, save as an image |
| inline preview, MCP App | the preview above |

## 1. Pick the surface

Call `list_open_design_skills` with `surface: "list"` to get the kinds of thing Open Design can make (`surfaces`, each with an id, label and description) and the `goals`, plain-language aims such as "Promote an event" or "Get hired", each with the surfaces it leads to.

- If the request starts with or clearly names a surface (by id or label, e.g. "wireframe", "diagram", "a poster"), use that surface.
- If it says what the design is for but names no surface ("help me get a UX job"), take the goal that fits.
- If it is empty or too vague to tell, show the user the goals (label and description) and ask one question: "What's it for?". Stop until they answer. Show the surfaces instead only if they ask what kinds of thing you can make.
- Once you have a goal, call `list_open_design_skills` with `goal` set to its id and use the surface marked `default`, unless the request points at another of that goal's surfaces. Ask which one only when the goal leads to several and you can't tell.

## 2. Ask what's missing

Call `list_open_design_skills` with `surface` set to the chosen id. The result has the surface's `questions` and its `entries`.

Ask only the questions the request doesn't already answer, all at once, in one short message. If the request answers them all, don't ask anything.

If no design system is active and the request names no look, also call `recommend_open_design_design_systems` with what you know (the surface, what it's for, how it should feel). If its result has `questions`, add the ones the request doesn't answer to that same message, and accept "you pick". Use its first recommendation as the `designSystemId` in step 3, and say which style you used and that they can pick another.

## 3. Build it

- If the surface has a `prompt` (for example `open-design-poster` or `open-design-social-post`), follow that flow from its first step with the user's request as the brief. In Copilot Chat it's the `/` command of the same name; in Claude Code and Codex it's the skill of the same name.
- Otherwise pick the entry that best fits the request. Entries come in curated order: the recipe first, then its remixable example when there is one. To start from a rendered example (an entry with `remixable: true`), call `remix_open_design_example`; otherwise call `prepare_open_design_brief` with its id, the brief and any recommended `designSystemId`, and follow the general Open Design flow: write the files, register the artifact, then check it with `check_open_design_artifact` before saying it's done.

<!-- claude-only -->
**Picking by eye (Claude Desktop Chat).** When the user wants to choose a starting example from pictures, and `show_open_design_examples` is in your tool list (it is listed only where the host shows MCP Apps inline), call it with `surface` set to the chosen id instead of listing entries in text. "Remix this" posts the pick in the chat; then call `remix_open_design_example` with the skillId it names. Without that tool, keep to the text list above.
<!-- /claude-only -->

<!-- claude-only -->
**Artifact preview.** If you have an Artifact tool, publish this design as its private artifact preview once it's registered and checked: call `publish_open_design_artifact` with `provider: "claude-artifact"` and follow what it returns. Publish again after each round of feedback you apply; it goes to the same artifact. Give the link once, then just say the preview was updated.
<!-- /claude-only -->

Never pick an entry marked `stub: true`.
