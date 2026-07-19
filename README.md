# Browser music player

A static local music player for GitHub Pages. It imports music into the browser, keeps the library in IndexedDB, and plays it without sending files to a server.

## What it supports

- Standalone audio and MP4 files
- Multiple files at once
- Complete folder imports
- Dragged files and folders
- ZIP archives containing supported music
- Optional playlist creation whenever a folder or ZIP is imported
- Search, sorting, favorites, recently played, playlists, queue, shuffle, repeat, seek, and volume
- Embedded title, artist, album, genre, year, and artwork extraction when available
- Media Session controls for supported operating systems and browsers
- Full backup export containing music files, metadata, favorites, recent history, playlists, and player settings
- Backup restore with **Merge** and **Replace** modes

## Import behavior

Individual tracks import immediately.

Folder and ZIP imports first open an **Import options** dialog. Every detected folder or archive can be selected and named as a playlist. Choosing **Import only** adds the tracks without creating playlists.

## Data export and restore

Open **Data → Export backup** to download a ZIP backup. The backup contains:

- A `manifest.json` file
- Every stored track under the `tracks/` directory
- Favorites, recently played tracks, playlists, sort preference, shuffle/repeat state, and volume

Open **Data → Restore backup** to restore one of these backups:

- **Merge** keeps the current library and adds missing tracks and playlists.
- **Replace** clears the current browser library before restoring.

Backups can be large because they include the actual music files.

## Supported file extensions

MP3, WAV, M4A, AAC, OGG, OGA, FLAC, Opus, WebM, and MP4.

Actual playback depends on the codecs supported by the browser.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload every file in this folder to the repository root, including `.nojekyll` and `.github/workflows/deploy-pages.yml`.
3. Open **Settings → Pages**.
4. Set the source to **GitHub Actions**.
5. Push to the `main` branch.

The included workflow publishes the site automatically.

## Local development

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Storage notes

- Music is stored in IndexedDB for the current browser profile and site origin.
- Clearing site data deletes the local library.
- Private browsing may restrict persistence.
- Storage limits depend on the browser, device, and available disk space.
- The optional metadata reader loads from CDNJS when metadata extraction is first needed. Imports still work with filename-based metadata if it cannot load.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `/` | Focus search |
| `←` / `→` | Seek 10 seconds |
| `M` | Mute |
| `S` | Toggle shuffle |
| `R` | Cycle repeat mode |
| `U` | Open import dialog |
| `Esc` | Close the queue or track menu |

## License

MIT
