import * as vscode from 'vscode';
import { getConfig } from '../config';
import { LocresStore } from '../store';
import { PatternMatcher } from '../matcher';

const DEBOUNCE_MS = 150;

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('unreal-localization');
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly matcher: PatternMatcher,
    private readonly store: LocresStore,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc)),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        const key = doc.uri.toString();
        const t = this.pending.get(key);
        if (t) {
          clearTimeout(t);
          this.pending.delete(key);
        }
        this.collection.delete(doc.uri);
      }),
      this.store.onDidUpdate(() => this.refreshAll()),
    );
  }

  refreshAll(): void {
    for (const doc of vscode.workspace.textDocuments) this.run(doc);
  }

  private schedule(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') return;
    const key = doc.uri.toString();
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.pending.delete(key);
      this.run(doc);
    }, DEBOUNCE_MS);
    this.pending.set(key, handle);
  }

  private run(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') return;
    const severity = getConfig().diagnosticsSeverity;
    const diagnostics: vscode.Diagnostic[] = [];
    for (const m of this.matcher.findAll(doc)) {
      if (!this.store.hasNamespace(m.ns)) {
        diagnostics.push(new vscode.Diagnostic(m.nsRange, `Namespace '${m.ns}' not found.`, severity));
        continue;
      }
      if (!this.store.hasKey(m.ns, m.key)) {
        diagnostics.push(new vscode.Diagnostic(m.keyRange, `Key '${m.key}' not found in namespace '${m.ns}'.`, severity));
      }
    }
    this.collection.set(doc.uri, diagnostics);
  }

  dispose(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    for (const d of this.disposables) d.dispose();
    this.collection.dispose();
  }
}
