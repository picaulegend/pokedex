import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('an invitation creates a member and only the first verified credential wins', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of ['0001_accounts_and_pokedex', '0007_passkeys', '0008_invitations'])
      db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'));
    db.exec(`
      INSERT INTO auth_invitations VALUES ('new-member','member@example.test','hash',unixepoch()+60,NULL);
      INSERT INTO auth_invitation_credentials VALUES ('first','new-member'),('second','new-member');
    `);
    const insert = db.prepare(
      `INSERT INTO passkey (id,userId,credentialID,publicKey,counter,deviceType,backedUp)
       VALUES (?,'new-member',?,'test-key',0,'singleDevice',0)`,
    );
    assert.equal(db.prepare('SELECT id FROM users').get(), undefined);
    insert.run('one', 'first');
    assert.equal(db.prepare("SELECT role FROM users WHERE id='new-member'").get().role, 'member');
    assert.ok(db.prepare('SELECT claimed_at FROM auth_invitations').get().claimed_at);
    assert.throws(() => insert.run('two', 'second'), /invitation is unavailable/);
    insert.run('three', 'later-signed-in-key');
    assert.equal(db.prepare('SELECT COUNT(*) AS keys FROM passkey').get().keys, 2);
    assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  } finally {
    db.close();
  }
});
