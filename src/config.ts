import * as vscode from 'vscode';

const SECTION = 'unreal-localization';

export interface PatternConfig {
  name: string;
  files: string[];
  template: string;
}

export interface ResolvedConfig {
  defaultCulture: string;
  root: string;
  target: string;
  patterns: PatternConfig[];
  diagnosticsSeverity: vscode.DiagnosticSeverity;
}

function mapSeverity(value: string | undefined): vscode.DiagnosticSeverity {
  switch ((value ?? 'information').toLowerCase()) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    case 'information':
    case 'info':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

export function getConfig(): ResolvedConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    defaultCulture: c.get<string>('defaultCulture', 'en'),
    root: c.get<string>('root', 'Content/Localization'),
    target: c.get<string>('target', 'Game'),
    patterns: c.get<PatternConfig[]>('patterns', []),
    diagnosticsSeverity: mapSeverity(c.get<string>('diagnosticsSeverity')),
  };
}

export function onDidChangeConfig(listener: (cfg: ResolvedConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      listener(getConfig());
    }
  });
}
