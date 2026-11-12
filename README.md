# In The Zone (working title: NOLOOK)

Basketball shooting trainer. Players tap Make or Miss, and the shooting percentage stays hidden until they finish. Mobile-first installable web app with no build step and no dependencies.

Live preview: https://in-the-zone-trainer.vercel.app (on-device preview backend; accounts and workouts stay in the browser that created them).

The product name is not final. It lives in three places: `js/brand.js`, `manifest.webmanifest`, and the `<title>` in `index.html`.

## What it does

- **Blind tracking:** big Make and Miss buttons, chronological undo, and no percentage or grade on screen until the workout is finished.
- **Call your shot:** before the reveal the player guesses their percentage; the report and logbook show how close their feel was.
- **Court spots:** multi-spot drills light up where to stand, prompt each rotation, and end in a per-spot shot map.
- **Heat line:** a line across the tracker widens with consecutive makes and the make chime climbs in pitch.
- **Court mode:** full-screen tracker for a phone on the floor, with screen wake lock and keyboard or Bluetooth clicker keys (M / X / Z or arrows / Backspace).
- **Honest saving:** every workout has one id, so retries cannot duplicate it; the report shows Saving, Saved or Not saved with a Retry.
- **Refresh recovery and logbook:** a reload restores the workout in progress; finished workouts feed per-drill trends.

## Layout

- `index.html`, `css/app.css`, `sw.js`, `manifest.webmanifest`: app shell and PWA files.
- `js/rules.js`: pure session rules (totals, undo, grades, levels, insights).
- `js/catalog.js`: the three drills, their court spots and coaching cues.
- `js/backend/`: `local.js` (on-device preview) and `supabase.js` (production), behind one interface.
- `js/views/`: sign-in, library, workout, report, logbook.
- `supabase/migrations/0001_init.sql`: tables, row-level security and the protected Pro entitlement.
- `tests/`: browser-run rule tests.

## Run it

```bash
/usr/bin/python3 -m http.server 8141
```

Open `http://localhost:8141`. Rule tests run in the browser at `http://localhost:8141/tests/`.

With `supabaseUrl` empty in `js/config.js` the app runs on the on-device preview backend: accounts and workouts live in that browser only. It exists for demos and for exercising every screen and failure state. It is not a security boundary.

## Going live

1. Create a Supabase project and apply `supabase/migrations/0001_init.sql`.
2. Put the project URL and anon key in `js/config.js`. Never the service-role key.
3. In Supabase Auth, set the site URL to the deployed origin so confirmation and recovery emails return to the app.
4. Host the folder on any static HTTPS host.

The Supabase adapter (`js/backend/supabase.js`) has not been run against a live project yet. Before release, run these against the deployed backend:

- Sign up under the real confirmation setting, sign in, finish Form Shooting with 7 makes and 3 misses, and read back exactly one matching row in `drill_logs`.
- As a free player, send direct REST requests that try to `update` or `insert` into `entitlements`, and to insert a `drill_logs` row for `elite-3pt-flow`. All must be rejected.
- As player A, try to select player B's `profiles` and `drill_logs` rows. Both must return nothing.
- Request a password reset and complete it from the emailed link.
- Install on iOS Safari and Android Chrome and open in standalone mode.

Granting Pro is a service-role action: `update entitlements set tier = 'pro' where user_id = '…'`. There is no purchase flow.

## Test hooks

- `/?failSaves=2` makes the next two preview-backend saves fail, to exercise the Not saved and Retry states.
- The "view as Pro" link on the Pro gate exists only on the preview backend.

## What is not done

- Mid-range and 3PT coaching cues are drafts and are labeled that way in the app until the trainer reviews them.
- The three YouTube videos have not been checked for relevance, availability, or embedding permission.
- No payments, no analytics destination (events are buffered in memory; wire `analyticsSink` in `js/config.js`), no privacy notice, no account deletion, no age policy.
- Routes are hash-based (`#/train/form-shooting`) so the app works on any static host without rewrite rules.
