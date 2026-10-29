# Carddex

A Pokémon card checklist in National Pokédex order. It includes 1,025 numbered species, from Bulbasaur to Pecharunt.

Open `public/index.html` in a browser, or use the local preview below. All names and images are in the HTML file. The checklist works offline after you save the file.

## Features

- One checkbox per species. Any card, language, or form can count.
- Search by name or National Pokédex number.
- Filter by generation or by All, Have, and Missing.
- Grid and compact views on desktop and phones.
- Share missing Pokémon as plain text: copy the list, use the device share menu where supported, or download a text file.
- A fixed top menu keeps sharing and backup actions within reach while you scroll.
- Saved generation, ownership filter, search, and layout settings.
- Progress saved in browser storage.
- JSON backup and restore, an HTML copy with progress, and a print view.

## Local preview

From the repository folder, run:

```sh
python3 -m http.server 8000 --directory public
```

Open <http://localhost:8000>. Press Control+C in the terminal to stop the server.

## Deploy to Cloudflare Pages

Push this repository to GitHub or GitLab. In Cloudflare, create a Pages project and connect that repository. Use these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `exit 0` |
| Build output directory | `public` |
| Root directory | Leave blank |

Cloudflare will publish `public/index.html` at the site root. There are no dependencies to install.

See the [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

## Share a missing list

Select **Share missing** in the top menu. Choose all generations or one generation, then use **Copy list**, **Share…**, or **Download .txt**. The native Share button appears when the browser supports it.

The list contains only unchecked Pokémon, in National Pokédex order. Search and the All/Have/Missing display filter do not shorten the shared list. The generation choice in the share window sets its scope.

## Collection storage

Each browser and site address has its own collection. The downloaded file and the hosted site use separate browser storage. Use **Back up** in the old copy, then **Restore** on the hosted site to move your checkmarks.

The **More file options** menu also has **Save HTML with progress**. This makes a file with your checkmarks included.

## Files

- `public/index.html`: the complete app, with all Pokémon data and images.
- `.gitignore`: excludes local files and collection backups from Git.

## Data and credits

The checklist has one entry for each National Pokédex number from #0001 to #1025. Newly announced Pokémon without a confirmed number are not included. Data checked on 29 October 2026.

Names and types come from [PokéAPI data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv). Images come from [PokéAPI sprites](https://github.com/PokeAPI/sprites).

This is an unofficial fan tool. Pokémon © Nintendo / Creatures / GAME FREAK. Pokémon names and artwork belong to their owners.
