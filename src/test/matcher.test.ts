import * as assert from 'assert';
import * as vscode from 'vscode';
import { PatternMatcher } from '../match/matcher';

const TEMPLATE = "GetText('<ns>', '<key>')";

let counter = 0;
async function openDoc(content: string, ext: '.ts' | '.cpp' = '.ts'): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:/ueloc-test-${process.pid}-${++counter}${ext}`);
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(0, 0), content);
  await vscode.workspace.applyEdit(edit);
  return doc;
}

function makeMatcher(template: string = TEMPLATE, files: string[] = ['**/*.ts']): PatternMatcher {
  const m = new PatternMatcher();
  m.setPatterns([{ files, template }]);
  return m;
}

suite('PatternMatcher.findAll', () => {
  test('captures ns and key (single quotes)', async () => {
    const matcher = makeMatcher();
    const doc = await openDoc(`const t = GetText('UI', 'Finish');`);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
    assert.strictEqual(matches[0].complete, true);
  });

  test('captures double-quoted call from single-quote template', async () => {
    const matcher = makeMatcher();
    const doc = await openDoc(`GetText("UI", "Finish")`);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
    assert.strictEqual(matches[0].complete, true);
  });

  test('selector filters by file glob', async () => {
    const matcher = makeMatcher(TEMPLATE, ['**/*.ts']);
    const cppDoc = await openDoc(`GetText('UI', 'Finish')`, '.cpp');
    assert.deepStrictEqual(matcher.findAll(cppDoc), []);
  });

  test('skips template missing <ns>', async () => {
    const matcher = new PatternMatcher();
    matcher.setPatterns([{ files: ['**/*.ts'], template: "GetText('<key>')" }]);
    const doc = await openDoc(`GetText('Finish')`);
    assert.deepStrictEqual(matcher.findAll(doc), []);
  });

  test('skips template missing comma between placeholders', async () => {
    const matcher = new PatternMatcher();
    matcher.setPatterns([{ files: ['**/*.ts'], template: "GetText('<ns>' '<key>')" }]);
    const doc = await openDoc(`GetText('UI' 'Finish')`);
    assert.deepStrictEqual(matcher.findAll(doc), []);
  });

  test('returns nsRange and keyRange that span literal interiors', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const [m] = matcher.findAll(doc);
    assert.strictEqual(doc.getText(m.nsRange), 'UI');
    assert.ok(m.keyRange);
    assert.strictEqual(doc.getText(m.keyRange), 'Finish');
    assert.strictEqual(doc.getText(m.fullRange), content);
  });
});

suite('PatternMatcher whitespace tolerance', () => {
  test('multi-line call with extra spaces around tokens', async () => {
    const matcher = makeMatcher();
    const content = `GetText(\n   "UI"   ,\n  "Finish"     )`;
    const doc = await openDoc(content);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
    assert.strictEqual(matches[0].complete, true);
  });

  test('no whitespace at all between tokens', async () => {
    const matcher = makeMatcher();
    const doc = await openDoc(`GetText('UI','Finish')`);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
    assert.strictEqual(matches[0].complete, true);
  });

  test('ns/key capture stops at newline (prevents greedy run-on)', async () => {
    const matcher = makeMatcher();
    // User typed `GetText('` then moved to the next line. ns must not eat into
    // the following code, otherwise we get a huge spurious match.
    const content = `GetText('\nconst x = 1;`;
    const doc = await openDoc(content);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, '');
    assert.strictEqual(matches[0].complete, false);
  });

  test('NSLOCTEXT-style 3rd argument does not disturb ns/key capture', async () => {
    // Template still GetText('<ns>', '<key>'); source has a third argument
    // (source string) like UE's NSLOCTEXT macro. Cascade #4 is `)` and is
    // optional, so the ',' after 'Finish' simply fails to match and the
    // cascade stops — ns/key still captured correctly.
    const matcher = makeMatcher();
    const content = `GetText("UI", "Finish", "Default")`;
    const doc = await openDoc(content);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
    assert.strictEqual(matches[0].complete, true);
    assert.ok(matches[0].keyRange);
    assert.strictEqual(doc.getText(matches[0].keyRange), 'Finish');
  });
});

suite('PatternMatcher.findAtPosition', () => {
  test('cursor inside ns literal returns ns slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const hit = matcher.findAtPosition(doc, doc.positionAt(content.indexOf('UI') + 1));
    assert.ok(hit);
    assert.strictEqual(hit.slot, 'ns');
    assert.strictEqual(hit.match.ns, 'UI');
  });

  test('cursor inside key literal returns key slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const hit = matcher.findAtPosition(doc, doc.positionAt(content.indexOf('Finish') + 1));
    assert.ok(hit);
    assert.strictEqual(hit.slot, 'key');
    assert.strictEqual(hit.match.key, 'Finish');
  });

  test('cursor between literals returns full slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const hit = matcher.findAtPosition(doc, doc.positionAt(content.indexOf(',')));
    assert.ok(hit);
    assert.strictEqual(hit.slot, 'full');
  });

  test('cursor outside any call returns undefined', async () => {
    const matcher = makeMatcher();
    const content = `const x = 1;\nGetText('UI', 'Finish');\nconst y = 2;`;
    const doc = await openDoc(content);
    const hit = matcher.findAtPosition(doc, new vscode.Position(0, 5));
    assert.strictEqual(hit, undefined);
  });
});

// Cases 1–7 from the UX spec; underscore in the comment marks cursor; `|` in the
// test content is the cursor marker we strip before opening.
suite('PatternMatcher partial-call coverage', () => {
  const cursorAt = (content: string) => content.indexOf('|');
  const stripCursor = (content: string) => content.replace('|', '');

  interface Expectation {
    content: string;
    slot: 'ns' | 'key' | 'full' | null;
  }
  const cases: Record<string, Expectation> = {
    '1. `GetText(|`': { content: 'GetText(|', slot: null },
    '2. `GetText(|)`': { content: 'GetText(|)', slot: null },
    "3. `GetText('|`": { content: "GetText('|", slot: 'ns' },
    "4. `GetText('|'`": { content: "GetText('|'", slot: 'ns' },
    "5. `GetText('|')`": { content: "GetText('|')", slot: 'ns' },
    "6. `GetText('|',`": { content: "GetText('|',", slot: 'ns' },
    "7. `GetText('|',)`": { content: "GetText('|',)", slot: 'ns' },
    "key partial: `GetText('UI', '|`": { content: "GetText('UI', '|", slot: 'key' },
  };

  for (const [label, { content, slot }] of Object.entries(cases)) {
    test(label, async () => {
      const matcher = makeMatcher();
      const doc = await openDoc(stripCursor(content));
      const hit = matcher.findAtPosition(doc, doc.positionAt(cursorAt(content)));
      if (slot === null) {
        assert.strictEqual(hit, undefined);
      } else {
        assert.ok(hit, `expected a hit at cursor`);
        assert.strictEqual(hit.slot, slot);
        assert.strictEqual(hit.match.complete, false);
      }
    });
  }
});

suite('PatternMatcher complete flag', () => {
  const cases: { content: string; complete: boolean }[] = [
    { content: "GetText('", complete: false },
    { content: "GetText(''", complete: false },
    { content: "GetText('UI'", complete: false },
    { content: "GetText('UI',", complete: false },
    { content: "GetText('UI', '", complete: false },
    { content: "GetText('UI', 'Finish", complete: false },
    { content: "GetText('UI', 'Finish'", complete: true },
    { content: "GetText('UI', 'Finish')", complete: true },
  ];

  for (const { content, complete } of cases) {
    test(`complete=${complete} for \`${content}\``, async () => {
      const matcher = makeMatcher();
      const doc = await openDoc(content);
      const matches = matcher.findAll(doc);
      assert.strictEqual(matches.length, 1, `expected one match`);
      assert.strictEqual(matches[0].complete, complete);
    });
  }
});
