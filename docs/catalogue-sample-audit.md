# Card catalogue sample audit

Sample checked at 2026-11-01T12:54:49.222513+00:00.

This historical audit uses English and Japanese 151, English Base Set, and English SVP Black Star Promos. It is isolated test data, not an app seed. The app's catalogue grows only when people add cards. Trainer and Energy records are checked for audit set totals and then excluded.

The main gap is image metadata: 28 Pokémon cards have no image URL. For 18 of them, both candidate image URLs return images. For 10, neither candidate URL returns an image. The source records are preserved. Candidate URLs need a picture check before they become corrections.

| Sample | Listed | Fetched | Pokémon imported | Variants imported | Pokémon species |
| --- | ---: | ---: | ---: | ---: | ---: |
| [en 151](https://api.tcgdex.net/v2/en/sets/sv03.5) | 207 | 207 | 185 | 346 | 151 |
| [ja ポケモンカード151](https://api.tcgdex.net/v2/ja/sets/SV2a) | 210 | 210 | 188 | 466 | 151 |
| [en Base Set](https://api.tcgdex.net/v2/en/sets/base1) | 102 | 102 | 69 | 283 | 69 |
| [en SVP Black Star Promos](https://api.tcgdex.net/v2/en/sets/svp) | 226 | 226 | 216 | 303 | 154 |

## Missing data and checks

Counts below apply to Pokémon cards. Image failures count URLs; each card has a small and large image URL.

| Sample | Missing artist | Missing or invalid Pokédex link | Missing image URL | Failed image URLs | No detailed variants | Generated variants | Flag disagreements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| en sv03.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja SV2a | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| en base1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| en svp | 0 | 0 | 28 | 0 | 0 | 0 | 0 |

## Issues

### Missing promo images

| Card | Name | Candidate image checks | Source record |
| --- | --- | --- | --- |
| svp-085 | Pikachu with Grey Felt Hat | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-085) |
| svp-102 | Oddish | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-102) |
| svp-175 | Espeon ex | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-175) |
| svp-176 | Umbreon ex | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-176) |
| svp-190 | Pikachu | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-190) |
| svp-191 | Sprigatito | [Small image](https://assets.tcgdex.net/en/sv/svp/191/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-191) |
| svp-192 | Fuecoco | [Small image](https://assets.tcgdex.net/en/sv/svp/192/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-192) |
| svp-196 | Charizard ex | [Small image](https://assets.tcgdex.net/en/sv/svp/196/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-196) |
| svp-199 | Zarude | [Small image](https://assets.tcgdex.net/en/sv/svp/199/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-199) |
| svp-200 | Eevee | [Small image](https://assets.tcgdex.net/en/sv/svp/200/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-200) |
| svp-201 | Zebstrika | [Small image](https://assets.tcgdex.net/en/sv/svp/201/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-201) |
| svp-202 | Kangaskhan | [Small image](https://assets.tcgdex.net/en/sv/svp/202/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-202) |
| svp-203 | Team Rocket's Wobbuffet | [Small image](https://assets.tcgdex.net/en/sv/svp/203/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-203) |
| svp-204 | Cynthia's Garchomp ex | [Small image](https://assets.tcgdex.net/en/sv/svp/204/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-204) |
| svp-205 | Team Rocket's Mewtwo ex | [Small image](https://assets.tcgdex.net/en/sv/svp/205/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-205) |
| svp-208 | Victini | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-208) |
| svp-209 | Thundurus | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-209) |
| svp-210 | Tornadus | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-210) |
| svp-211 | Gothitelle | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-211) |
| svp-212 | Reuniclus | No working candidate URL | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-212) |
| svp-213 | Feraligatr | [Small image](https://assets.tcgdex.net/en/sv/svp/213/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-213) |
| svp-214 | Pikachu | [Small image](https://assets.tcgdex.net/en/sv/svp/214/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-214) |
| svp-215 | Toxtricity ex | [Small image](https://assets.tcgdex.net/en/sv/svp/215/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-215) |
| svp-216 | Team Rocket's Mewtwo ex | [Small image](https://assets.tcgdex.net/en/sv/svp/216/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-216) |
| svp-217 | Team Rocket's Nidoking ex | [Small image](https://assets.tcgdex.net/en/sv/svp/217/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-217) |
| svp-218 | Team Rocket's Persian ex | [Small image](https://assets.tcgdex.net/en/sv/svp/218/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-218) |
| svp-225 | Pikachu | [Small image](https://assets.tcgdex.net/en/sv/svp/225/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-225) |
| svp-500 | Terapagos & Friends | [Small image](https://assets.tcgdex.net/en/sv/svp/500/low.webp); both URLs work | [TCGdex](https://api.tcgdex.net/v2/en/cards/svp-500) |

Additional check: 36 image URLs were available at the candidate paths for cards without image metadata. Candidate paths use the asset prefix from another card in the same set. Per-URL results are in the JSON report.

## Import requirements found

- 25 source variant IDs repeat across different cards. Keep variant IDs scoped to their card and language.
- Variant types include `holo` (501), `lenticular` (1), `metal` (1), `normal` (472), `reverse` (423). Preserve these values.
- `svp-500` (Terapagos & Friends) links to Pokémon numbers 25,906,909,912,1024. Keep multiple Pokémon links per card.
- [English 151 card numbers 001–207](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf): passed.

## Verification limits

- Set totals use the provider's own lists. English 151 card numbers are also checked against the official checklist.
- Image checks use HTTP HEAD and content type; they do not verify the picture or print-specific artwork.
- A detailed variant record does not prove that every physical variant is present.
- Pokédex checks validate number range and 151 base-card order, not every species assignment.
- Generated variants are provider defaults and may not describe the physical finish.

## Files and repeat run

Run `python3 scripts/catalogue_sample.py` from the repository. The first run reads the public API and checks image URLs. Responses are saved in `work/catalogue-sample/cache`. Use `--offline` to rebuild from those responses or `--refresh` to replace them.

Generated files: `work/catalogue-sample/catalogue.sqlite`, `catalogue.sql`, and `report.json`. This is a local SQLite audit. SQL exports are for isolated local audit and test databases only.

Database integrity: `ok`. Foreign key errors: `0`. Image URLs checked: `1316` total; `1260` supplied by the source.

SQL export and restore: passed with foreign keys enabled.

Source snapshot SHA-256: `5405356ae495a1692a9a8e56f104db18b4b259fcf7b0abb4d84a3e70eea348ff`.

## Data credits

Source: [TCGdex](https://tcgdex.dev/). Database copyright © 2021 TCGdex, [MIT licence](https://github.com/tcgdex/cards-database/blob/master/LICENSE). Pokémon names, card text, and artwork belong to their respective rights holders. The sample stores image URLs and response headers. A copy of the database licence is included with the generated files.
