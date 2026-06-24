import * as vscode from 'vscode';
import { getConfig } from '../common/config';
import { LocresStore } from '../locres/store';
import { PatternMatcher } from '../match/matcher';
import { log } from '../common/misc';

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('unreal-localization');
  private readonly subs: vscode.Disposable[];

  constructor(matcher: PatternMatcher, store: LocresStore) {
    const refresh = (doc: vscode.TextDocument) => {
      if (doc.uri.scheme !== 'file') return;
      const severity = getConfig().diagnosticsSeverity;
      const matches = matcher.findAll(doc);
      const diagnostics: vscode.Diagnostic[] = [];
      for (const m of matches) {
        if (!m.complete) continue;
        if (!store.hasNamespace(m.ns)) {
          diagnostics.push(new vscode.Diagnostic(m.nsRange, `Namespace '${m.ns}' not found.`, severity));
        } else if (!store.hasKey(m.ns, m.key)) {
          diagnostics.push(new vscode.Diagnostic(m.keyRange ?? m.fullRange, `Key '${m.key}' not found in namespace '${m.ns}'.`, severity));
        }
      }
      this.collection.set(doc.uri, diagnostics);
      if (matches.length > 0) {
        log.trace(`refresh ${doc.uri.fsPath}: ${matches.length} matches, ${diagnostics.length} issues`);
      }
    };

    this.subs = [
      vscode.workspace.onDidOpenTextDocument(refresh),
      vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.collection.delete(doc.uri)),
      store.onDidUpdate(() => vscode.workspace.textDocuments.forEach(refresh)),
    ];
  }

  dispose(): void {
    for (const s of this.subs) s.dispose();
    this.collection.dispose();
  }
}
