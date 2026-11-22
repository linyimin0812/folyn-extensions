# 工作日程 / Work Schedule

A Folyn extension (trusted tier) for planning the day's work items.

Activity bar → **工作日程** opens a day view on today with the quick-add input
focused. Type a title and press Enter, or open **更多选项** for the full form.
To edit an item, use the pencil shown on hover or double-click its title.

**日 / 周 / 月** switches the view. The week lists each day's items, which can
be ticked there; the month shows up to three titles a day. Both total the
period's progress and estimated hours, and clicking a day opens it in the day
view, where items are created and edited.

## Work item

| Field | Rule |
|---|---|
| Date | required; edit it to move an item to another day |
| Title | required |
| Done | not done / done; cancelling an item means deleting it |
| Time | optional, same day only (`end > start`), overlaps allowed |
| Priority | high / medium / low, default medium |
| Estimate | optional hours in 0.5 steps, independent of the time range |
| Tags | free text, completed from tags already used |
| Note | optional plain text |
| Linked files | optional outputs and references from a vault |

The day view lists timed items by start time, then untimed items by priority.
Unfinished items stay on their day until you press **同步未完成** on today.
It lists the unfinished items of earlier days, all checked; untick the ones to
leave, or mark finished ones as done, then confirm. Chosen items move to today
and lose their time slot. An item whose subitems are partly done stays behind with the done ones,
and a copy on today takes the unfinished subitems.

## Data

All items live in the extension's app storage (`api.storage`, key `items`),
shared across vaults and never written into a vault. If the stored data
cannot be read, the page stays read-only so it never overwrites it.

## Subitems

An item can have subitems, one level deep. A subitem has the same fields as an
item except its date, which always follows its parent. A parent is done exactly
when all its subitems are; ticking a parent sets them all. Deleting a parent
deletes its subitems. The day's progress counts top-level items only.

## Linked files

An item can link vault files as **outputs** or **references**; a file has one
role per item. Each link records its vault, so a file from another vault is
shown greyed with that vault's name and cannot be opened until you switch to
it. Links do not follow renames or moves: opening a missing file reports it
and keeps the link.

Requires a Folyn host with `api.vault.current()` and `api.vault.listFiles()`;
on an older host the page says so instead of loading.

## Develop

```sh
pnpm install
pnpm test         # vitest
pnpm typecheck
pnpm build        # → dist/ (install via Settings → Extensions → Install from folder…)
pnpm package      # → folyn-work-schedule.zip
```

## Structure

- `src/model.ts` — work item type, validation, day ordering, storage parsing
- `src/schedule.ts` — the persisted schedule (load / add / update / toggle / remove)
- `src/page.tsx` — day view page; `src/item-editor.tsx` — create/edit form
- `src/calendar.tsx` — date picker; `src/file-links.tsx` — linked-file chips and search
- `src/i18n.ts` — zh / en / ja / fr / de / es strings, following the host locale
- `src/styles.ts` — styles on the host theme tokens
