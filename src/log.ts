import * as vscode from 'vscode';

export const channel = vscode.window.createOutputChannel('Unreal Localization', { log: true });

export const log = {
  trace: (msg: string, ...args: unknown[]) => channel.trace(msg, ...args),
  debug: (msg: string, ...args: unknown[]) => channel.debug(msg, ...args),
  info: (msg: string, ...args: unknown[]) => channel.info(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => channel.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => channel.error(msg, ...args),
};
