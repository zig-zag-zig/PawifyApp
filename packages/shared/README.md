# @pawify/shared

`@pawify/shared` is the small shared TypeScript package used by Pawify API (`apps/server`) and Pawify App (`apps/mobile`). It keeps music-domain types and display/date helpers consistent across the backend and mobile client.

## What It Contains

- Shared artist, release, track, external-link, and background-task result types.
- Release date parsing and sorting helpers.
- Friendly artist display-name helpers for MusicBrainz disambiguation labels.

## Used By

- `apps/server` - TypeScript/Express backend API
- `apps/mobile` - Expo/React Native mobile app

## Project Layout

```text
models/
  models.ts       Shared music-domain types
utils/
  dateUtil.ts     Date parsing, display, future-date, and release sorting helpers
  helpers.ts      Small display helpers
```

## Development Notes

This repository is intentionally tiny. Changes should stay compatible with both consumers:

- Avoid adding platform-specific imports.
- Keep helpers deterministic and easy to test in API and app projects.
- Treat exported types as cross-repo contracts.
- Update Pawify and PawifyApp together when changing shared shapes.

## License

This project is licensed under the 0BSD license.
