# PawifyModule

PawifyModule is the small shared TypeScript module used by Pawify API and Pawify App. It keeps music-domain types and display/date helpers consistent across the backend and mobile client.

## What It Contains

- Shared artist, release, track, external-link, and background-task result types.
- Release date parsing and sorting helpers.
- Friendly artist display-name helpers for MusicBrainz disambiguation labels.

## Used By

- [Pawify](https://github.com/zig-zag-zig/Pawify) - TypeScript/Express backend API
- [PawifyApp](https://github.com/zig-zag-zig/PawifyApp) - Expo/React Native mobile app

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
