export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type ExportJobId = Brand<string, "ExportJobId">;
export type ThemeId = Brand<string, "ThemeId">;

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
