# features/artist

Artist detail page. Module map (all hooks have a single consumer,
`useArtistPage`, and are intentionally split by role):

| Module | Role |
|---|---|
| `hooks/useArtistPage` | orchestration: composes reducer, cache, actions, tasks |
| `hooks/useArtistPageActions` | follow/unfollow, artist/release-group navigation |
| `hooks/useArtistPageDataTasks` | artist + releases queue tasks |
| `hooks/useArtistPageDataTaskResults` | task-result handling |
| `hooks/useArtistPageTaskResolvers` | profile-image/cover task resolution |
| `hooks/useArtistRelationshipImageTasks` | relationship member image tasks |
| `hooks/useArtistPageCacheMergers` | cache-map merge helpers |
| `hooks/useArtistPageDiagnostics` | diagnostics logging |
| `state/artistReducer` | page reducer |
| `domain/*` | pure domain (release sections, relationships, age) |

Note: `domain/releaseSections` and the import of
`features/release/domain/releaseGroupReleases` in `useArtistPageActions` are
intentional cross-feature shared-domain imports (release normalization used
by the artist page).
