#!/usr/bin/env python3
"""Prepare an isolated local audit import. This data must not seed the app."""
import argparse
import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLES = ('catalogue_sets', 'catalogue_cards', 'catalogue_card_pokemon', 'catalogue_variants')


def sql_value(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def prepare(source, output, fixture=False):
    source, output = source.resolve(), output.resolve()
    db = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('The sample database failed its integrity check.')
    card_ids = None
    if fixture:
        card_ids = {row[0] for row in db.execute("""SELECT id FROM catalogue_cards WHERE
          source_id IN ('sv03.5-001','sv03.5-166','SV2a-001','base1-44','svp-085','svp-500')""")}
    statements = ['-- Isolated audit/test data only. Do not seed the app. See scripts/TCGdex-LICENSE.txt.']
    counts = {}
    for table in TABLES:
        columns = [r[1] for r in db.execute(f'PRAGMA table_info({table})')]
        rows = list(db.execute(f'SELECT * FROM {table} ORDER BY 1'))
        if card_ids is not None and table != 'catalogue_sets':
            rows = [r for r in rows if r['id' if table == 'catalogue_cards' else 'card_id'] in card_ids]
        counts[table] = len(rows)
        key = ['card_id', 'pokedex_number'] if table == 'catalogue_card_pokemon' else ['id']
        updates = ','.join(f'{c}=excluded.{c}' for c in columns if c not in key)
        conflict = f'ON CONFLICT({",".join(key)}) DO UPDATE SET {updates}' if updates else 'ON CONFLICT DO NOTHING'
        if table == 'catalogue_card_pokemon':
            # Replace source links, then rebuild affected progress after all rows are imported.
            for card_id in sorted({r['card_id'] for r in rows}):
                statements.append(f'DELETE FROM catalogue_card_pokemon WHERE card_id={sql_value(card_id)};')
        for row in rows:
            statements.append(f'INSERT INTO {table}({",".join(columns)}) VALUES({",".join(sql_value(row[c]) for c in columns)}) {conflict};')
    # A source correction can change the species linked to an owned card.
    # Update the aggregate, but keep all private ownership and old checkmarks.
    aggregate = '''(legacy_owned OR EXISTS(SELECT 1 FROM inventory i
      JOIN catalogue_variants v ON v.id=i.variant_id JOIN catalogue_card_pokemon p ON p.card_id=v.card_id
      WHERE i.user_id=pokedex_progress.user_id AND i.quantity>0 AND p.pokedex_number=pokedex_progress.pokemon_id))'''
    statements.append(f"UPDATE pokedex_progress SET owned={aggregate},revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owned<>{aggregate};")
    statements.append('''INSERT INTO pokedex_progress(user_id,pokemon_id,owned,legacy_owned,revision,updated_at)
      SELECT DISTINCT i.user_id,p.pokedex_number,1,0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM inventory i JOIN catalogue_variants v ON v.id=i.variant_id JOIN catalogue_card_pokemon p ON p.card_id=v.card_id
      WHERE i.quantity>0 ON CONFLICT(user_id,pokemon_id) DO NOTHING;''')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(statements) + '\n')
    print(json.dumps({'file': str(output.relative_to(ROOT)), 'bytes': output.stat().st_size, 'records': counts}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, default=ROOT / 'work/catalogue-sample/catalogue.sqlite')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'work/catalogue-sample/import-d1.sql')
    parser.add_argument('--fixture', action='store_true')
    args = parser.parse_args()
    prepare(args.source, args.output, args.fixture)
