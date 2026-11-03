#!/usr/bin/env python3
"""Import and audit a small TCGdex catalogue. Uses only the Python standard library."""

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import pathlib
import sqlite3
import time
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
API = "https://api.tcgdex.net/v2"
SAMPLES = (("en", "sv03.5"), ("ja", "SV2a"), ("en", "base1"), ("en", "svp"))
EN_151_CHECKLIST = "https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf"
NAMESPACE = uuid.UUID("e56dc6e4-460b-4874-8688-e012628c78b4")
SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE catalogue_sets (
  id TEXT PRIMARY KEY, language TEXT NOT NULL, source_id TEXT NOT NULL,
  name TEXT NOT NULL, source_url TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(language, source_id)
);
CREATE TABLE catalogue_cards (
  id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES catalogue_sets(id),
  language TEXT NOT NULL, source_id TEXT NOT NULL, local_number TEXT NOT NULL,
  name TEXT NOT NULL, artist TEXT, image_url TEXT, source_updated TEXT,
  source_url TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(language, source_id)
);
CREATE TABLE catalogue_card_pokemon (
  card_id TEXT NOT NULL REFERENCES catalogue_cards(id), pokedex_number INTEGER NOT NULL,
  PRIMARY KEY(card_id, pokedex_number), CHECK(pokedex_number BETWEEN 1 AND 1025)
);
CREATE TABLE catalogue_variants (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES catalogue_cards(id),
  source_id TEXT, source_key TEXT NOT NULL, type TEXT, subtype TEXT,
  foil TEXT, size TEXT, stamps_json TEXT NOT NULL, source_json TEXT NOT NULL,
  UNIQUE(card_id, source_key)
);
CREATE INDEX catalogue_cards_set ON catalogue_cards(set_id);
CREATE INDEX catalogue_card_pokemon_number ON catalogue_card_pokemon(pokedex_number);
CREATE INDEX catalogue_cards_artist ON catalogue_cards(artist);
"""


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def identifier(kind, *parts):
    return str(uuid.uuid5(NAMESPACE, encode([kind, *parts])))


class Source:
    def __init__(self, directory, offline=False, refresh=False):
        self.directory = directory
        self.offline = offline
        self.refresh = refresh
        directory.mkdir(parents=True, exist_ok=True)

    def read(self, url, image=False):
        cache = self.directory / (hashlib.sha256(url.encode()).hexdigest() + ".json")
        if cache.exists() and (self.offline or not self.refresh):
            return json.loads(cache.read_text())
        if self.offline:
            raise RuntimeError(f"No cached response for {url}")
        result = {"url": url, "checked_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        for attempt in range(3):
            try:
                request = urllib.request.Request(
                    url, method="HEAD" if image else "GET",
                    headers={"User-Agent": "Carddex-catalogue-sample/1.0"},
                )
                with urllib.request.urlopen(request, timeout=30) as response:
                    result.update(status=response.status, content_type=response.headers.get("Content-Type", ""))
                    if not image:
                        body = response.read()
                        result["sha256"] = hashlib.sha256(body).hexdigest()
                        result["data"] = json.loads(body)
                break
            except urllib.error.HTTPError as error:
                result.update(status=error.code, error=str(error))
                if error.code != 429 and error.code < 500:
                    break
            except (urllib.error.URLError, TimeoutError, ValueError) as error:
                result.update(status=None, error=str(error))
            if attempt < 2:
                time.sleep(2 ** attempt)
        if result.get("status") == 200 and (image or "data" in result):
            result.pop("error", None)
        cache.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        return result


def parallel(items, function, label):
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for number, result in enumerate(pool.map(function, items), 1):
            results.append(result)
            if number % 100 == 0 or number == len(items):
                print(f"{label}: {number}/{len(items)}", flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "work/catalogue-sample")
    parser.add_argument("--report", type=pathlib.Path, default=ROOT / "docs/catalogue-sample-audit.md")
    parser.add_argument("--offline", action="store_true", help="Use saved responses only.")
    parser.add_argument("--refresh", action="store_true", help="Replace saved responses with fresh requests.")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "TCGdex-LICENSE.txt").write_text((ROOT / "scripts/TCGdex-LICENSE.txt").read_text())
    source = Source(args.output / "cache", args.offline, args.refresh)
    sets = []
    for language, set_id in SAMPLES:
        response = source.read(f"{API}/{language}/sets/{set_id}")
        if not isinstance(response.get("data"), dict) or not isinstance(response["data"].get("cards"), list):
            raise RuntimeError(f"Cannot read set: {response}")
        sets.append((language, set_id, response))

    requests = [(language, set_id, brief) for language, set_id, response in sets for brief in response["data"]["cards"]]

    def fetch_card(item):
        language, set_id, brief = item
        return language, set_id, brief, source.read(f"{API}/{language}/cards/{brief['id']}")

    cards = parallel(requests, fetch_card, "Card records")
    pokemon = [item for item in cards if item[3].get("data", {}).get("category") == "Pokemon"]
    supplied_image_urls = {
        f"{item[3]['data']['image']}/{quality}.webp"
        for item in pokemon if item[3]["data"].get("image") for quality in ("low", "high")
    }
    prefixes = {
        (language, set_id): next((card["image"].rsplit("/", 1)[0] for card in response["data"]["cards"] if card.get("image")), None)
        for language, set_id, response in sets
    }
    candidates = {}
    for language, set_id, _, response in pokemon:
        card = response["data"]
        prefix = prefixes[language, set_id]
        if not card.get("image") and prefix:
            candidates[language, card["id"]] = [f"{prefix}/{card['localId']}/{quality}.webp" for quality in ("low", "high")]
    image_urls = sorted(supplied_image_urls | {url for urls in candidates.values() for url in urls})
    images = parallel(image_urls, lambda url: source.read(url, image=True), "Image URLs")
    image_results = {row["url"]: row for row in images}
    issues = []
    summaries = []

    def issue(language, set_id, card_id, code, detail):
        issues.append({"language": language, "set_id": set_id, "card_id": card_id, "code": code, "detail": detail})

    # Rebuild the test database from the saved source snapshot. It contains no user data.
    database = args.output / "catalogue.sqlite"
    database.unlink(missing_ok=True)
    db = sqlite3.connect(database)
    db.executescript(SCHEMA)
    for language, set_id, response in sets:
        data = response["data"]
        set_key = identifier("set", language, set_id)
        db.execute("INSERT INTO catalogue_sets VALUES (?,?,?,?,?,?)", (set_key, language, set_id, data["name"], response["url"], encode(data)))
        listed = data["cards"]
        listed_ids = [card["id"] for card in listed]
        if len(set(listed_ids)) != len(listed_ids):
            issue(language, set_id, None, "duplicate_listed_card", "The set list repeats a card ID.")
        expected = data.get("cardCount", {}).get("total")
        if expected != len(listed):
            issue(language, set_id, None, "set_count_mismatch", {"reported": expected, "listed": len(listed)})
        rows = [item for item in cards if item[0:2] == (language, set_id)]
        summary = {
            "language": language, "set_id": set_id, "name": data["name"], "source_url": response["url"],
            "reported_cards": expected, "listed_cards": len(listed), "fetched_cards": 0,
            "pokemon_cards": 0, "excluded_cards": 0, "variants": 0,
            "missing_artist": 0, "missing_pokedex": 0, "missing_image": 0,
            "failed_image_urls": 0, "missing_detailed_variants": 0,
            "variant_flag_mismatches": 0, "generated_variants": 0,
            "unlisted_image_urls_available": 0,
        }
        for _, _, brief, response in rows:
            card = response.get("data")
            card_id = brief["id"]
            if not isinstance(card, dict) or card.get("id") != card_id:
                issue(language, set_id, card_id, "card_fetch_failed", response.get("error", "Missing or incorrect card ID"))
                continue
            summary["fetched_cards"] += 1
            if card.get("set", {}).get("id") != set_id:
                issue(language, set_id, card_id, "wrong_set", card.get("set"))
            if card.get("category") != "Pokemon":
                summary["excluded_cards"] += 1
                continue
            summary["pokemon_cards"] += 1
            card_key = identifier("card", language, card_id)
            db.execute("INSERT INTO catalogue_cards VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                card_key, set_key, language, card_id, str(card["localId"]), card["name"],
                card.get("illustrator"), card.get("image"), card.get("updated"), response["url"], encode(card),
            ))
            artist = card.get("illustrator")
            if not isinstance(artist, str) or artist.strip().lower() in ("", "unknown", "n/a", "?"):
                summary["missing_artist"] += 1
                issue(language, set_id, card_id, "missing_artist", artist)
            numbers = card.get("dexId")
            valid = isinstance(numbers, list) and bool(numbers) and all(type(n) is int and 1 <= n <= 1025 for n in numbers)
            if not valid:
                summary["missing_pokedex"] += 1
                issue(language, set_id, card_id, "missing_or_invalid_pokedex", numbers)
            else:
                for number in sorted(set(numbers)):
                    db.execute("INSERT INTO catalogue_card_pokemon VALUES (?,?)", (card_key, number))
                # In both 151 sets, cards 001–151 follow National Pokédex order.
                if set_id in ("sv03.5", "SV2a") and str(card["localId"]).isdigit() and 1 <= int(card["localId"]) <= 151:
                    if numbers != [int(card["localId"])]:
                        issue(language, set_id, card_id, "151_pokedex_mismatch", numbers)
            if not card.get("image"):
                summary["missing_image"] += 1
                checks = [image_results[url] for url in candidates.get((language, card_id), [])]
                available = [check["url"] for check in checks if check.get("status") == 200 and check.get("content_type", "").startswith("image/")]
                summary["unlisted_image_urls_available"] += len(available)
                issue(language, set_id, card_id, "missing_image", {
                    "name": card["name"], "source_url": response["url"],
                    "candidate_checks": [{"url": check["url"], "status": check.get("status")} for check in checks],
                    "available_candidate_urls": available,
                })
            else:
                for quality in ("low", "high"):
                    url = f"{card['image']}/{quality}.webp"
                    check = image_results[url]
                    if check.get("status") != 200 or not check.get("content_type", "").startswith("image/"):
                        summary["failed_image_urls"] += 1
                        issue(language, set_id, card_id, "image_request_failed", {"quality": quality, **check})
            variants = card.get("variants_detailed")
            if not isinstance(variants, list) or not variants:
                summary["missing_detailed_variants"] += 1
                issue(language, set_id, card_id, "missing_detailed_variants", card.get("variants"))
                continue
            seen = set()
            for variant in variants:
                source_id = variant.get("variantId")
                # Provider variant IDs repeat across cards. Scope them to the parent card.
                physical = {k: v for k, v in variant.items() if k not in ("pricing", "thirdParty", "variantId")}
                source_key = source_id or hashlib.sha256(encode(physical).encode()).hexdigest()
                if source_key in seen:
                    issue(language, set_id, card_id, "duplicate_variant", source_key)
                    continue
                seen.add(source_key)
                summary["variants"] += 1
                if source_id == "generated":
                    summary["generated_variants"] += 1
                    issue(language, set_id, card_id, "generated_variant", physical)
                if not variant.get("type"):
                    issue(language, set_id, card_id, "variant_type_missing", variant)
                db.execute("INSERT INTO catalogue_variants VALUES (?,?,?,?,?,?,?,?,?,?)", (
                    identifier("variant", card_key, source_key), card_key, source_id, source_key,
                    variant.get("type"), variant.get("subtype"), variant.get("foil"), variant.get("size"),
                    encode(variant.get("stamp", [])), encode(variant),
                ))
            for kind in ("normal", "holo", "reverse"):
                flag = card.get("variants", {}).get(kind)
                present = any(v.get("type") == kind for v in variants)
                if type(flag) is bool and flag != present:
                    summary["variant_flag_mismatches"] += 1
                    issue(language, set_id, card_id, "variant_flags_disagree", {"type": kind, "flag": flag, "detailed": present})
        summary["pokedex_species"] = db.execute(
            "SELECT COUNT(DISTINCT p.pokedex_number) FROM catalogue_card_pokemon p JOIN catalogue_cards c ON c.id=p.card_id WHERE c.set_id=?",
            (set_key,),
        ).fetchone()[0]
        summaries.append(summary)

    db.commit()
    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = db.execute("PRAGMA foreign_key_check").fetchall()
    # Create every table first, then insert parents before their children.
    # sqlite3.iterdump() alone orders tables by name and can break foreign keys.
    statements = list(db.iterdump())
    table_order = ("catalogue_sets", "catalogue_cards", "catalogue_card_pokemon", "catalogue_variants")
    sql = SCHEMA + "\n" + "\n".join(
        statement for table in table_order for statement in statements
        if statement.startswith(f'INSERT INTO "{table}" ')
    ) + "\n"
    (args.output / "catalogue.sql").write_text(sql)
    restored = sqlite3.connect(":memory:")
    restored.executescript(sql)
    if restored.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("The SQL export has broken foreign keys.")
    totals = {table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in (
        "catalogue_sets", "catalogue_cards", "catalogue_variants", "catalogue_card_pokemon"
    )}
    for table, count in totals.items():
        if restored.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] != count:
            raise RuntimeError(f"The SQL export changed the row count for {table}.")
    restored.close()
    english_151 = next(response["data"] for language, set_id, response in sets if (language, set_id) == ("en", "sv03.5"))
    numbers_151 = sorted(int(card["localId"]) for card in english_151["cards"])
    reference_checks = [{
        "source_url": EN_151_CHECKLIST, "check": "English 151 card numbers 001–207",
        "passed": numbers_151 == list(range(1, 208)),
    }]
    variant_types = dict(db.execute("SELECT type, COUNT(*) FROM catalogue_variants GROUP BY type"))
    reused_variant_ids = db.execute(
        "SELECT COUNT(*) FROM (SELECT source_id FROM catalogue_variants WHERE source_id IS NOT NULL GROUP BY source_id HAVING COUNT(DISTINCT card_id)>1)"
    ).fetchone()[0]
    multiple_pokemon = [{"language": language, "card_id": card_id, "name": name, "pokedex_numbers": numbers} for language, card_id, name, numbers in db.execute(
        "SELECT c.language,c.source_id,c.name,GROUP_CONCAT(p.pokedex_number) FROM catalogue_cards c JOIN catalogue_card_pokemon p ON c.id=p.card_id GROUP BY c.id HAVING COUNT(*)>1"
    )]
    missing_images = [row for row in issues if row["code"] == "missing_image"]
    image_recovery = {
        "missing_image_fields": len(missing_images),
        "cards_with_both_candidate_images": sum(len(row["detail"]["available_candidate_urls"]) == 2 for row in missing_images),
        "cards_with_no_candidate_image": sum(not row["detail"]["available_candidate_urls"] for row in missing_images),
    }
    snapshot = hashlib.sha256("".join(sorted(row[3].get("sha256", "") for row in cards)).encode()).hexdigest()
    report = {
        "source": "TCGdex", "scope": "Physical Pokémon cards only; all listed card records fetched to check set totals.",
        "checked_at": max(row["checked_at"] for row in images) if images else max(row[3]["checked_at"] for row in cards),
        "source_snapshot_sha256": snapshot, "sets": summaries, "totals": totals, "issues": issues,
        "image_urls_checked": len(images), "database_integrity": integrity, "foreign_key_errors": foreign_keys,
        "supplied_image_urls_checked": len(supplied_image_urls),
        "reference_checks": reference_checks, "variant_types": variant_types,
        "variant_ids_reused_across_cards": reused_variant_ids, "cards_with_multiple_pokemon": multiple_pokemon,
        "image_recovery": image_recovery,
        "sql_round_trip": "passed with foreign keys enabled",
        "limits": [
            "Set totals use the provider's own lists. English 151 card numbers are also checked against the official checklist.",
            "Image checks use HTTP HEAD and content type; they do not verify the picture or print-specific artwork.",
            "A detailed variant record does not prove that every physical variant is present.",
            "Pokédex checks validate number range and 151 base-card order, not every species assignment.",
            "Generated variants are provider defaults and may not describe the physical finish.",
        ],
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(markdown_report(report))
    db.close()
    print(json.dumps({"totals": totals, "issue_count": len(issues), "report": str(args.report), "database": str(database)}, indent=2), flush=True)
    if integrity != "ok" or foreign_keys or any(row["code"] == "card_fetch_failed" for row in issues):
        raise SystemExit(1)


def markdown_report(report):
    lines = [
        "# Card catalogue sample audit", "", f"Sample checked at {report['checked_at']}.", "",
        "This historical audit uses English and Japanese 151, English Base Set, and English SVP Black Star Promos. "
        "It is isolated test data, not an app seed. The app's catalogue grows only when people add cards. "
        "The database contains Pokémon cards. Trainer and Energy records are checked for set totals and then excluded.", "",
        f"The main gap is image metadata: {report['image_recovery']['missing_image_fields']} Pokémon cards have no image URL. "
        f"For {report['image_recovery']['cards_with_both_candidate_images']} of them, both candidate image URLs return images. "
        f"For {report['image_recovery']['cards_with_no_candidate_image']}, neither candidate URL returns an image. "
        "The source records are preserved. Candidate URLs need a picture check before they become corrections.", "",
        "| Sample | Listed | Fetched | Pokémon imported | Variants imported | Pokémon species |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["sets"]:
        label = f"{row['language']} {row['name']}"
        lines.append(f"| [{label}]({row['source_url']}) | {row['listed_cards']} | {row['fetched_cards']} | {row['pokemon_cards']} | {row['variants']} | {row['pokedex_species']} |")
    lines += ["", "## Missing data and checks", "",
        "Counts below apply to Pokémon cards. Image failures count URLs; each card has a small and large image URL.", "",
        "| Sample | Missing artist | Missing or invalid Pokédex link | Missing image URL | Failed image URLs | No detailed variants | Generated variants | Flag disagreements |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["sets"]:
        values = [row[key] for key in ("missing_artist", "missing_pokedex", "missing_image", "failed_image_urls", "missing_detailed_variants", "generated_variants", "variant_flag_mismatches")]
        lines.append(f"| {row['language']} {row['set_id']} | " + " | ".join(map(str, values)) + " |")
    lines += ["", "## Issues", ""]
    if not report["issues"]:
        lines.append("No issues found by the checks below.")
    codes = sorted({row["code"] for row in report["issues"]})
    for code in codes:
        group = [row for row in report["issues"] if row["code"] == code]
        if code == "missing_image":
            lines += ["### Missing promo images", "", "| Card | Name | Candidate image checks | Source record |", "| --- | --- | --- | --- |"]
            for row in group:
                detail = row["detail"]
                available = detail["available_candidate_urls"]
                status = f"[Small image]({available[0]}); both URLs work" if len(available) == 2 else "No working candidate URL"
                lines.append(f"| {row['card_id']} | {detail['name']} | {status} | [TCGdex]({detail['source_url']}) |")
            available = sum(row["unlisted_image_urls_available"] for row in report["sets"])
            lines += ["", f"Additional check: {available} image URLs were available at the candidate paths for cards without image metadata. "
                      "Candidate paths use the asset prefix from another card in the same set. Per-URL results are in the JSON report.", ""]
            continue
        lines += [f"### {code}", "", f"Records: {len(group)}. Examples:", ""]
        for row in group[:8]:
            detail = encode(row["detail"]).replace("`", "'")
            lines.append(f"- **{row['language']} {row['card_id'] or row['set_id']}**: {detail}")
        lines.append("")
    lines += ["## Import requirements found", "",
        f"- {report['variant_ids_reused_across_cards']} source variant IDs repeat across different cards. Keep variant IDs scoped to their card and language.",
        "- Variant types include " + ", ".join(f"`{name}` ({count})" for name, count in sorted(report["variant_types"].items())) + ". Preserve these values.",
    ]
    for row in report["cards_with_multiple_pokemon"]:
        lines.append(f"- `{row['card_id']}` ({row['name']}) links to Pokémon numbers {row['pokedex_numbers']}. Keep multiple Pokémon links per card.")
    for check in report["reference_checks"]:
        lines.append(f"- [{check['check']}]({check['source_url']}): {'passed' if check['passed'] else 'failed'}.")
    lines += ["", "## Verification limits", ""]
    lines += [f"- {value}" for value in report["limits"]]
    lines += ["", "## Files and repeat run", "",
        "Run `python3 scripts/catalogue_sample.py` from the repository. The first run reads the public API and checks image URLs. "
        "Responses are saved in `work/catalogue-sample/cache`. Use `--offline` to rebuild from those responses or `--refresh` to replace them.", "",
        "Generated files: `work/catalogue-sample/catalogue.sqlite`, `catalogue.sql`, and `report.json`. "
        "This is a local SQLite audit. SQL exports are for isolated local audit and test databases only.", "",
        f"Database integrity: `{report['database_integrity']}`. Foreign key errors: `{len(report['foreign_key_errors'])}`. "
        f"Image URLs checked: `{report['image_urls_checked']}` total; `{report['supplied_image_urls_checked']}` supplied by the source.", "",
        f"SQL export and restore: {report['sql_round_trip']}.", "",
        f"Source snapshot SHA-256: `{report['source_snapshot_sha256']}`.", "",
        "## Data credits", "",
        "Source: [TCGdex](https://tcgdex.dev/). Database copyright © 2021 TCGdex, "
        "[MIT licence](https://github.com/tcgdex/cards-database/blob/master/LICENSE). "
        "Pokémon names, card text, and artwork belong to their respective rights holders. "
        "The sample stores image URLs and response headers. A copy of the database licence is included with the generated files.", "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
