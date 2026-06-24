import * as vscode from 'vscode';

export const log = vscode.window.createOutputChannel('Unreal Localization', { log: true });

type AnyMethod = (this: unknown, ...args: unknown[]) => unknown;

export function timed<T extends AnyMethod>(originalMethod: T, context: ClassMethodDecoratorContext): T {
  const name = String(context.name);
  function replacement(this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const start = performance.now();
    const finish = () => {
      const ms = (performance.now() - start).toFixed(2);
      const owner = (this as { constructor?: { name?: string } } | null)?.constructor?.name;
      log.debug(`${owner ? `${owner}.` : ''}${name} took ${ms}ms`);
    };
    let result: ReturnType<T>;
    try {
      result = originalMethod.apply(this, args) as ReturnType<T>;
    } catch (err) {
      finish();
      throw err;
    }
    if (result instanceof Promise) {
      return result.finally(finish) as ReturnType<T>;
    }
    finish();
    return result;
  }
  return replacement as T;
}
