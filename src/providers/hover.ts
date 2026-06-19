import * as vscode from 'vscode';
import { getConfig } from '../config';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

export function registerHover(matcher: PatternMatcher, store: LocresStore): vscode.Disposable {
  const provider: vscode.HoverProvider = {
    provideHover(doc, pos) {
      const hit = matcher.findAtPosition(doc, pos);
      if (!hit) return undefined;
      const { ns, key } = hit.match;
      if (!store.hasKey(ns, key)) return undefined;
      const value = store.getTranslation(ns, key) ?? '';
      const culture = getConfig().defaultCulture;
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**\`${ns}\` ▸ \`${key}\`** _(${culture})_\n\n`);
      md.appendCodeblock(value, 'plaintext');
      return new vscode.Hover(md, hit.match.fullRange);
    },
  };
  return vscode.languages.registerHoverProvider(matcher.combinedSelector(), provider);
}
