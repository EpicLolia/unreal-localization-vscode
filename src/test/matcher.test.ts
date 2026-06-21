import * as assert from 'assert';
import * as vscode from 'vscode';
import { PatternMatcher } from '../matcher';

const PATTERN_REGEX = 'GetText\\(\\s*[\'"](?<ns>[^\'"]*)[\'"]\\s*,\\s*[\'"](?<key>[^\'"]*)[\'"]\\s*\\)';

let counter = 0;
async function openDoc(content: string, ext: '.ts' | '.cpp' = '.ts'): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:/ueloc-test-${process.pid}-${++counter}${ext}`);
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(0, 0), content);
  await vscode.workspace.applyEdit(edit);
  return doc;
}

function makeMatcher(regex: string = PATTERN_REGEX, files: string[] = ['**/*.ts']): PatternMatcher {
  const m = new PatternMatcher();
  m.setPatterns([{ name: 'GetText', files, regex }]);
  return m;
}

suite('PatternMatcher.findAll', () => {
  test('captures ns and key', async () => {
    const matcher = makeMatcher();
    const doc = await openDoc(`const t = GetText('UI', 'Finish');`);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
  });

  test('captures double-quoted literals via permissive regex', async () => {
    const matcher = makeMatcher();
    const doc = await openDoc(`GetText("UI", "Finish")`);
    const matches = matcher.findAll(doc);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].ns, 'UI');
    assert.strictEqual(matches[0].key, 'Finish');
  });

  test('selector filters by file glob', async () => {
    const matcher = makeMatcher(PATTERN_REGEX, ['**/*.ts']);
    const cppDoc = await openDoc(`GetText('UI', 'Finish')`, '.cpp');
    assert.deepStrictEqual(matcher.findAll(cppDoc), []);
  });

  test('skips pattern with invalid regex', async () => {
    const matcher = new PatternMatcher();
    matcher.setPatterns([{ name: 'bad', files: ['**/*.ts'], regex: '[' }]);
    const doc = await openDoc(`GetText('UI', 'Finish')`);
    assert.deepStrictEqual(matcher.findAll(doc), []);
  });

  test('skips pattern missing ns named group', async () => {
    const matcher = new PatternMatcher();
    matcher.setPatterns([{ name: 'no-ns', files: ['**/*.ts'], regex: "GetText\\('(?<key>[^']*)'\\)" }]);
    const doc = await openDoc(`GetText('Finish')`);
    assert.deepStrictEqual(matcher.findAll(doc), []);
  });

  test('returns nsRange and keyRange that span literal interiors', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const [m] = matcher.findAll(doc);
    assert.strictEqual(doc.getText(m.nsRange), 'UI');
    assert.strictEqual(doc.getText(m.keyRange), 'Finish');
    assert.strictEqual(doc.getText(m.fullRange), content);
  });
});

suite('PatternMatcher.findAtPosition', () => {
  test('cursor inside ns literal returns ns slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const offset = content.indexOf('UI') + 1;
    const hit = matcher.findAtPosition(doc, doc.positionAt(offset));
    assert.ok(hit, 'expected a hit');
    assert.strictEqual(hit.slot, 'ns');
    assert.strictEqual(hit.match.ns, 'UI');
  });

  test('cursor inside key literal returns key slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const offset = content.indexOf('Finish') + 1;
    const hit = matcher.findAtPosition(doc, doc.positionAt(offset));
    assert.ok(hit);
    assert.strictEqual(hit.slot, 'key');
    assert.strictEqual(hit.match.key, 'Finish');
  });

  test('cursor between literals returns full slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('UI', 'Finish')`;
    const doc = await openDoc(content);
    const offset = content.indexOf(',');
    const hit = matcher.findAtPosition(doc, doc.positionAt(offset));
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

  test('cursor at closing quote of empty ns still resolves to ns slot', async () => {
    const matcher = makeMatcher();
    const content = `GetText('', 'Finish')`;
    const doc = await openDoc(content);
    const offset = content.indexOf("''") + 1;
    const hit = matcher.findAtPosition(doc, doc.positionAt(offset));
    assert.ok(hit);
    assert.strictEqual(hit.slot, 'ns');
    assert.strictEqual(hit.match.ns, '');
  });
});
