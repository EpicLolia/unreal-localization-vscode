import * as vscode from 'vscode';
import { getConfig } from '../config';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

export function registerHover(matcher: PatternMatcher, store: LocresStore): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    { scheme: 'file' },
    {
      provideHover(doc, pos) {
        const hit = matcher.findAtPosition(doc, pos);
        if (!hit || !hit.match.complete || !store.hasKey(hit.match.ns, hit.match.key)) return undefined;
        const { ns, key } = hit.match;
        const value = store.getTranslation(ns, key) ?? '';
        const md = new vscode.MarkdownString()
          .appendMarkdown(`**\`${ns}\` ▸ \`${key}\`** _(${getConfig().defaultCulture})_\n\n`)
          .appendCodeblock(value, 'plaintext');
        return new vscode.Hover(md, hit.match.fullRange);
      },
    },
  );
}
