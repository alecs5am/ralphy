#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO = path.resolve(import.meta.dir, "..");

function findUnsafeExports(
  entryFiles: readonly string[],
  files: ReadonlyMap<string, string> = new Map(),
): string[] {
  const normalizedFiles = new Map(
    [...files].map(([fileName, source]) => [path.resolve(fileName), source]),
  );
  const options: ts.CompilerOptions = {
    lib: ["lib.es2022.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.fileExists = (fileName) =>
    normalizedFiles.has(path.resolve(fileName)) || fileExists(fileName);
  host.readFile = (fileName) =>
    normalizedFiles.get(path.resolve(fileName)) ?? readFile(fileName);
  host.getSourceFile = (fileName, languageVersion) => {
    const source = host.readFile(fileName);
    return source === undefined
      ? undefined
      : ts.createSourceFile(fileName, source, languageVersion, true);
  };
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      const virtualFile = moduleName.startsWith(".")
        ? path.resolve(
            path.dirname(containingFile),
            moduleName.replace(/\.js$/, ".ts"),
          )
        : undefined;
      if (virtualFile && normalizedFiles.has(virtualFile)) {
        return {
          extension: ts.Extension.Ts,
          isExternalLibraryImport: false,
          resolvedFileName: virtualFile,
        };
      }
      if (!moduleName.startsWith(".")) return undefined;
      return ts.resolveModuleName(moduleName, containingFile, options, host)
        .resolvedModule;
    });

  const rootNames = [...new Set([
    ...entryFiles.map((fileName) => path.resolve(fileName)),
    ...normalizedFiles.keys(),
  ])];
  const program = ts.createProgram({ host, options, rootNames });
  const checker = program.getTypeChecker();
  const offenders: string[] = [];

  const resolveAlias = (symbol: ts.Symbol): ts.Symbol => {
    const seen = new Set<ts.Symbol>();
    let current = symbol;
    while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
      seen.add(current);
      current = checker.getAliasedSymbol(current);
    }
    return current;
  };

  const explicitRawName = (symbol: ts.Symbol | undefined): string | undefined => {
    if (!symbol) return undefined;
    const target = resolveAlias(symbol);
    const isTypeSymbol = (target.flags & (
      ts.SymbolFlags.Class |
      ts.SymbolFlags.Enum |
      ts.SymbolFlags.Interface |
      ts.SymbolFlags.TypeAlias |
      ts.SymbolFlags.TypeParameter
    )) !== 0;
    if (!isTypeSymbol) return undefined;
    const name = target.getName();
    return name === "PreparedObject" || name.endsWith("Row") ? name : undefined;
  };

  const isInternalRawSymbol = (symbol: ts.Symbol): boolean =>
    (symbol.declarations ?? []).some((declaration) => {
      const fileName = declaration.getSourceFile().fileName.replaceAll("\\", "/");
      return /\/(?:cli\/lib\/store|\.boundary-fixtures)\/internal-[^/]+\.ts$/.test(
        fileName,
      );
    });

  const seenTypes = new Set<ts.Type>();
  const seenSymbols = new Set<ts.Symbol>();
  const seenTypeNodes = new Set<ts.TypeNode>();

  const unsafeInSymbol = (
    symbol: ts.Symbol,
    includeInternalDeclaration = false,
  ): string | undefined => {
    const target = resolveAlias(symbol);
    const direct = explicitRawName(target);
    if (direct) return direct;
    if (seenSymbols.has(target)) return undefined;
    seenSymbols.add(target);

    const declaration = target.valueDeclaration ?? target.declarations?.[0];
    if (declaration) {
      const unsafe = unsafeInType(
        checker.getTypeOfSymbolAtLocation(target, declaration),
      );
      if (unsafe) return unsafe;
    }

    if ((target.flags & ts.SymbolFlags.Type) !== 0) {
      const unsafe = unsafeInType(checker.getDeclaredTypeOfSymbol(target));
      if (unsafe) return unsafe;
    }

    for (const targetDeclaration of target.declarations ?? []) {
      const unsafe = unsafeInSignatureNode(targetDeclaration);
      if (unsafe) return unsafe;
    }

    return includeInternalDeclaration && isInternalRawSymbol(target)
      ? target.getName()
      : undefined;
  };

  const unsafeInType = (type: ts.Type): string | undefined => {
    const direct = explicitRawName(type.aliasSymbol) ?? explicitRawName(type.symbol);
    if (direct) return direct;
    if (seenTypes.has(type)) return undefined;
    seenTypes.add(type);

    if (type.aliasSymbol) {
      const unsafe = unsafeInSymbol(type.aliasSymbol);
      if (unsafe) return unsafe;
    }

    for (const member of type.isUnionOrIntersection() ? type.types : []) {
      const unsafe = unsafeInType(member);
      if (unsafe) return unsafe;
    }

    const typeArguments = type.aliasTypeArguments ?? (
      (type.flags & ts.TypeFlags.Object) !== 0 &&
      ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
        ? checker.getTypeArguments(type as ts.TypeReference)
        : []
    );
    for (const typeArgument of typeArguments) {
      const unsafe = unsafeInType(typeArgument);
      if (unsafe) return unsafe;
    }

    for (const signature of [
      ...type.getCallSignatures(),
      ...type.getConstructSignatures(),
    ]) {
      for (const typeParameter of signature.getTypeParameters() ?? []) {
        const constraint = checker.getBaseConstraintOfType(typeParameter);
        if (constraint) {
          const unsafe = unsafeInType(constraint);
          if (unsafe) return unsafe;
        }
      }
      for (const parameter of signature.getParameters()) {
        const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
        if (!declaration) continue;
        const unsafe = unsafeInType(
          checker.getTypeOfSymbolAtLocation(parameter, declaration),
        );
        if (unsafe) return unsafe;
      }
      const unsafe = unsafeInType(checker.getReturnTypeOfSignature(signature));
      if (unsafe) return unsafe;
    }

    const symbolDeclarations = [type.aliasSymbol, type.symbol]
      .flatMap((symbol) => symbol?.declarations ?? []);
    const inspectProperties = symbolDeclarations.length === 0 || symbolDeclarations.some(
      (declaration) => !declaration.getSourceFile().fileName.includes("/node_modules/"),
    );
    if (inspectProperties) {
      for (const property of checker.getPropertiesOfType(type)) {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        if (!declaration) continue;
        const unsafe = unsafeInType(
          checker.getTypeOfSymbolAtLocation(property, declaration),
        );
        if (unsafe) return unsafe;
      }
    }

    return undefined;
  };

  const unsafeInTypeNode = (node: ts.TypeNode): string | undefined => {
    if (seenTypeNodes.has(node)) return undefined;
    seenTypeNodes.add(node);

    const resolved = unsafeInType(checker.getTypeAtLocation(node));
    if (resolved) return resolved;

    let unsafe: string | undefined;
    const visit = (child: ts.Node): void => {
      if (unsafe) return;
      if (ts.isIdentifier(child) || ts.isQualifiedName(child)) {
        const symbol = checker.getSymbolAtLocation(child);
        const direct = explicitRawName(symbol);
        if (direct) {
          unsafe = direct;
          return;
        }
        if (symbol && (resolveAlias(symbol).flags & ts.SymbolFlags.TypeAlias) !== 0) {
          unsafe = unsafeInSymbol(symbol);
          if (unsafe) return;
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return unsafe;
  };

  const unsafeInSignatureNode = (declaration: ts.Declaration): string | undefined => {
    let unsafe: string | undefined;
    const visit = (node: ts.Node): void => {
      if (unsafe || ts.isBlock(node) || ts.isExpression(node)) return;
      if (ts.isTypeNode(node)) {
        unsafe = unsafeInTypeNode(node);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration);
    return unsafe;
  };

  for (const file of entryFiles.map((fileName) => path.resolve(fileName))) {
    const sourceFile = program.getSourceFile(file);
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;

    const exports = checker.getExportsOfModule(moduleSymbol).sort((left, right) =>
      left.getName().localeCompare(right.getName())
    );
    for (const exported of exports) {
      seenTypes.clear();
      seenSymbols.clear();
      seenTypeNodes.clear();
      const unsafe = unsafeInSymbol(exported, true);
      if (unsafe) offenders.push(`${file}:${exported.getName()}:${unsafe}`);
    }
  }
  return offenders;
}

function boundaryFixtures() {
  const fixture = (name: string) => path.join(REPO, ".boundary-fixtures", `${name}.ts`);
  const internalTypes = fixture("internal-types");
  const internalObjects = fixture("internal-objects");
  const exportedConst = fixture("exported-const");
  const exportedArray = fixture("exported-array");
  const inferredArray = fixture("inferred-array");
  const asyncRaw = fixture("async-raw");
  const promiseRaw = fixture("promise-raw");
  const reexport = fixture("reexport");
  const inferred = fixture("inferred");
  const aliased = fixture("aliased");
  const conditional = fixture("conditional");
  const keys = fixture("keys");
  const indexed = fixture("indexed");
  const mapped = fixture("mapped");
  const safe = fixture("safe");
  const files = new Map([
    [internalTypes, `export type ObjectRow = { id: string };`],
    [
      internalObjects,
      `import type { ObjectRow } from "./internal-types.js";
       export function getObjectRow(): ObjectRow { return { id: "object-1" }; }
       export function resolveObjectPath(id: string): string { return id; }`,
    ],
    [
      exportedConst,
      `import type { ObjectRow } from "./internal-types.js";
       export const object: ObjectRow = { id: "object-1" };`,
    ],
    [
      exportedArray,
      `import { getObjectRow } from "./internal-objects.js";
       export const objects = [getObjectRow()];`,
    ],
    [
      inferredArray,
      `import { getObjectRow } from "./internal-objects.js";
       export function loadObjects() { return [getObjectRow()]; }`,
    ],
    [
      asyncRaw,
      `import { getObjectRow } from "./internal-objects.js";
       export async function loadObjectAsync() { return getObjectRow(); }`,
    ],
    [
      promiseRaw,
      `import { getObjectRow } from "./internal-objects.js";
       export function loadObjectPromise() { return Promise.resolve(getObjectRow()); }`,
    ],
    [reexport, `export { resolveObjectPath } from "./internal-objects.js";`],
    [
      inferred,
      `import type { ObjectRow } from "./internal-types.js";
       export function loadObject() { return { id: "object-1" } as ObjectRow; }`,
    ],
    [
      aliased,
      `import type { ObjectRow } from "./internal-types.js";
       type StoredObject = ObjectRow;
       export function loadAliased(): StoredObject { return { id: "object-1" }; }`,
    ],
    [
      conditional,
      `import type { ObjectRow } from "./internal-types.js";
       export type Maybe<T> = T extends true ? ObjectRow : string;`,
    ],
    [
      keys,
      `import type { ObjectRow } from "./internal-types.js";
       export type ObjectKeys = keyof ObjectRow;`,
    ],
    [
      indexed,
      `import type { ObjectRow } from "./internal-types.js";
       export type ObjectId = ObjectRow["id"];`,
    ],
    [
      mapped,
      `import type { ObjectRow } from "./internal-types.js";
       export type Copy = { [K in keyof ObjectRow]: ObjectRow[K] };`,
    ],
    [
      safe,
      `export type Cursor = { nextRow: number; lastRow: number };
       export const advance = (nextRow: number, lastRow: number) => nextRow + lastRow;`,
    ],
  ]);
  const expected = new Map([
    [exportedConst, [`${exportedConst}:object:ObjectRow`]],
    [exportedArray, [`${exportedArray}:objects:ObjectRow`]],
    [inferredArray, [`${inferredArray}:loadObjects:ObjectRow`]],
    [asyncRaw, [`${asyncRaw}:loadObjectAsync:ObjectRow`]],
    [promiseRaw, [`${promiseRaw}:loadObjectPromise:ObjectRow`]],
    [reexport, [`${reexport}:resolveObjectPath:resolveObjectPath`]],
    [inferred, [`${inferred}:loadObject:ObjectRow`]],
    [aliased, [`${aliased}:loadAliased:ObjectRow`]],
    [conditional, [`${conditional}:Maybe:ObjectRow`]],
    [keys, [`${keys}:ObjectKeys:ObjectRow`]],
    [indexed, [`${indexed}:ObjectId:ObjectRow`]],
    [mapped, [`${mapped}:Copy:ObjectRow`]],
    [safe, []],
  ]);
  return { files, expected };
}

function main(): void {
  const storeDir = path.join(REPO, "cli", "lib", "store");
  const entries = fs.readdirSync(storeDir)
    .filter((file) => file.endsWith(".ts") && !/^internal-|^verify\.ts$/.test(file))
    .map((file) => path.join(storeDir, file))
    .sort();
  const offenders = findUnsafeExports(entries);
  const fixtures = boundaryFixtures();
  const fixtureOffenders = findUnsafeExports(
    [...fixtures.expected.keys()],
    fixtures.files,
  );
  const selfCheckMismatches = [...fixtures.expected].flatMap(([file, expected]) => {
    const actual = fixtureOffenders.filter((offender) => offender.startsWith(`${file}:`));
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? []
      : [{ fixture: path.basename(file), expected, actual }];
  });
  const ok = offenders.length === 0 && selfCheckMismatches.length === 0;
  const result = {
    ok,
    scanned: entries.length,
    fixtures: fixtures.expected.size,
    offenders: offenders.slice(0, 50),
    selfCheckMismatches,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!ok) process.exit(1);
}

main();
