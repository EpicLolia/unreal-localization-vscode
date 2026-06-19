import * as vscode from 'vscode';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

export function registerCompletion(matcher: PatternMatcher, store: LocresStore): vscode.Disposable {
  const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(doc, pos) {
      const hit = matcher.findAtPosition(doc, pos);
      if (!hit) return undefined;

      if (hit.slot === 'ns') {
        return store.listNamespaces().map((ns) => {
          const item = new vscode.CompletionItem(ns, vscode.CompletionItemKind.Module);
          item.detail = `${store.listKeys(ns).length} keys`;
          item.range = hit.match.nsRange;
          return item;
        });
      }

      if (hit.slot === 'key' && store.hasNamespace(hit.match.ns)) {
        return store.listKeys(hit.match.ns).map((key) => {
          const value = store.getTranslation(hit.match.ns, key) ?? '';
          const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field);
          item.detail = value.replace(/\s+/g, ' ').trim();
          if (value) item.documentation = new vscode.MarkdownString().appendCodeblock(value, 'plaintext');
          item.range = hit.match.keyRange;
          return item;
        });
      }

      return undefined;
    },
  };

  return vscode.languages.registerCompletionItemProvider({ scheme: 'file' }, provider, '"', "'");
}
