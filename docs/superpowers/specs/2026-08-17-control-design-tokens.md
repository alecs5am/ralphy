# Control design tokens

## Goal

Apply the compact, low-contrast profile-menu language to reusable desktop controls without changing content cards, media stages, or window chrome.

## Token model

- Existing color, radius, spacing, and motion values remain primitives.
- `field-*` tokens define input, search, textarea, and compact segmented-control surfaces.
- `menu-*` tokens define Select, workspace picker, agent popovers, profile/help menus, and context menus.
- Shared interaction tokens define hover, selected, text, placeholder, and accessible focus states.

## Component contract

- Fields use a 30px default height, 10px radius, low-contrast border, and the compact control surface.
- Floating menus use 2px outer padding, 16px radius, the same low-contrast border as the profile menu, and 30px compact items.
- Hover and open states affect the whole interactive row.
- Focus remains keyboard-visible without introducing an accent-colored ring.
- Existing Radix Select behavior and native input semantics remain unchanged.

## Scope

SelectMenu, workspace picker, sidebar/workspace/document/activity/settings searches, document editor fields, agent menu/search/composer controls, media context menu, settings segmented controls, and legacy reusable filter controls.

## Verification

Design-system contract tests assert token presence and shared component adoption. Typecheck, renderer tests, build, and visual checks cover Nightmaker and DentiAI at wide and compact window sizes.
