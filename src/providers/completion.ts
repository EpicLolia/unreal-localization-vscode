import * as vscode from 'vscode';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

export function registerCompletion(matcher: PatternMatcher, store: LocresStore): vscode.Disposable {
  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(doc, pos) {
      const hit = matcher.findAtPosition(doc, pos);
      if (!hit) return undefined;

      if (hit.slot === 'ns') {
        const items: vscode.CompletionItem[] = [];
        for (const ns of store.listNamespaces()) {
          const item = new vscode.CompletionItem(ns, vscode.CompletionItemKind.Module);
          item.detail = `${store.keyCount(ns)} keys`;
          item.range = hit.match.nsRange;
          items.push(item);
        }
        return items;
      }

      if (hit.slot === 'key') {
        if (!store.hasNamespace(hit.match.ns)) return undefined;
        const items: vscode.CompletionItem[] = [];
        for (const key of store.listKeys(hit.match.ns)) {
          const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field);
          const value = store.getTranslation(hit.match.ns, key) ?? '';
          item.detail = previewLine(value);
          if (value) {
            const md = new vscode.MarkdownString();
            md.appendCodeblock(value, 'plaintext');
            item.documentation = md;
          }
          item.range = hit.match.keyRange;
          items.push(item);
        }
        return items;
      }

      return undefined;
    },
  };

  return vscode.languages.registerCompletionItemProvider(matcher.combinedSelector(), provider, '"', "'", ',');
}

function previewLine(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? oneLine.slice(0, 99) + '…' : oneLine;
}
