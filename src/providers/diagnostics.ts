import * as vscode from 'vscode';
import { getConfig } from '../config';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('unreal-localization');
  private readonly subs: vscode.Disposable[];

  constructor(matcher: PatternMatcher, store: LocresStore) {
    const refresh = (doc: vscode.TextDocument) => {
      if (doc.uri.scheme !== 'file') return;
      const severity = getConfig().diagnosticsSeverity;
      const diagnostics: vscode.Diagnostic[] = [];
      for (const m of matcher.findAll(doc)) {
        if (!store.hasNamespace(m.ns)) {
          diagnostics.push(new vscode.Diagnostic(m.nsRange, `Namespace '${m.ns}' not found.`, severity));
        } else if (!store.hasKey(m.ns, m.key)) {
          diagnostics.push(new vscode.Diagnostic(m.keyRange, `Key '${m.key}' not found in namespace '${m.ns}'.`, severity));
        }
      }
      this.collection.set(doc.uri, diagnostics);
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
