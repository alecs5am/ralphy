import { createHash } from "node:crypto";
import postcss, { type Rule } from "postcss";
import ts from "typescript";

export const CSS_NAMED_COLORS = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray",
  "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
  "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold",
  "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo",
  "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
  "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
  "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip",
  "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown",
  "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
  "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal",
  "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen",
] as const;

export const CSS_SYSTEM_COLORS = [
  "accentcolor", "accentcolortext", "activetext", "buttonborder", "buttonface", "buttontext",
  "canvas", "canvastext", "field", "fieldtext", "graytext", "highlight", "highlighttext",
  "linktext", "mark", "marktext", "selecteditem", "selecteditemtext", "visitedtext",
  "activeborder", "activecaption", "appworkspace", "background", "buttonhighlight", "buttonshadow",
  "captiontext", "inactiveborder", "inactivecaption", "inactivecaptiontext", "infobackground", "infotext",
  "menu", "menutext", "scrollbar", "threeddarkshadow", "threedface", "threedhighlight",
  "threedlightshadow", "threedshadow", "window", "windowframe", "windowtext",
] as const;

const HEX_COLOR = /#(?:[\dA-F]{8}|[\dA-F]{6}|[\dA-F]{4}|[\dA-F]{3})(?![\dA-F])/gi;
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;
const NAMED_COLOR = new RegExp(`(?<![\\w-])(?:${CSS_NAMED_COLORS.join("|")})(?![\\w-])`, "gi");
const SYSTEM_COLOR = new RegExp(`(?<![\\w-])(?:${CSS_SYSTEM_COLORS.join("|")})(?![\\w-])`, "gi");
const EXACT_SYSTEM_COLOR = new RegExp(`^(?:${CSS_SYSTEM_COLORS.join("|")})$`, "i");
const SEMANTIC_PAINT = /(?<![\w-])(?:currentcolor|none|transparent)(?![\w-])/gi;

type SystemColorMode = "none" | "exact" | "all";

function decodeCssEscapes(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length;) {
    if (value[index] !== "\\") {
      decoded += value[index++];
      continue;
    }
    const hex = value.slice(index + 1).match(/^[\dA-F]{1,6}/i)?.[0];
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      decoded += codePoint === 0 || codePoint > 0x10FFFF || codePoint >= 0xD800 && codePoint <= 0xDFFF
        ? "\uFFFD"
        : String.fromCodePoint(codePoint);
      index += hex.length + 1;
      if (/[\t\n\f\r ]/.test(value[index] ?? "")) index += value[index] === "\r" && value[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === "\r" || escaped === "\n" || escaped === "\f") {
      index += escaped === "\r" && value[index + 2] === "\n" ? 3 : 2;
      continue;
    }
    decoded += escaped ?? "\\";
    index += escaped === undefined ? 1 : 2;
  }
  return decoded;
}

function colorTokens(value: string, includeSemanticPaint = false, systemColors: SystemColorMode = "none"): string[] {
  const normalized = decodeCssEscapes(value);
  const patterns = [HEX_COLOR, COLOR_FUNCTION, NAMED_COLOR, ...(includeSemanticPaint ? [SEMANTIC_PAINT] : [])];
  const tokens = patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => match[0]));
  if (systemColors === "all") tokens.push(...[...normalized.matchAll(SYSTEM_COLOR)].map((match) => match[0]));
  if (systemColors === "exact" && EXACT_SYSTEM_COLOR.test(normalized.trim())) tokens.push(normalized.trim());
  return tokens;
}

function acceptsCssColor(property: string): boolean {
  const normalized = property.toLowerCase();
  return normalized.startsWith("--")
    || /(?:^|-)color$/.test(normalized)
    || /^(?:background|border|outline|box-shadow|text-shadow|fill|stroke|filter|backdrop-filter|text-decoration|text-emphasis|column-rule)(?:-|$)/.test(normalized);
}

function issue(path: string, line: number, token: string): string {
  return `${path}:${line}:${token}`;
}

export function auditCss(source: string, path: string): string[] {
  try {
    const root = postcss.parse(source, { from: path });
    const issues: string[] = [];
    root.walkDecls((declaration) => {
      const systemColors = acceptsCssColor(declaration.prop) ? "all" : "none";
      issues.push(...colorTokens(declaration.value, false, systemColors).map((token) => issue(path, declaration.source?.start?.line ?? 1, token)));
    });
    root.walkAtRules((rule) => {
      issues.push(...colorTokens(rule.params).map((token) => issue(path, rule.source?.start?.line ?? 1, token)));
      for (const value of rule.params.matchAll(/:\s*([^;)]+)/g)) {
        issues.push(...colorTokens(value[1], false, "all").map((token) => issue(path, rule.source?.start?.line ?? 1, token)));
      }
    });
    return issues;
  } catch (error) {
    return [`${path}:parse:${error instanceof Error ? error.message : String(error)}`];
  }
}

interface TypeScriptColorSite {
  line: number;
  nodeStart: number;
  token: string;
}

function isStructuralSystemString(value: string, node: ts.Node): boolean {
  const normalized = decodeCssEscapes(value).trim().toLowerCase();
  if (!EXACT_SYSTEM_COLOR.test(normalized)) return false;
  if (ts.isLiteralTypeNode(node.parent)) return true;
  if (ts.isJsxAttribute(node.parent)) {
    const name = node.parent.name.getText().toLowerCase();
    if (name === "role" || name === "aria-haspopup") return true;
  }
  if (ts.isPropertyAssignment(node.parent)) {
    const name = ts.isIdentifier(node.parent.name) || ts.isStringLiteral(node.parent.name) ? node.parent.name.text.toLowerCase() : "";
    if (name === "kind" || name === normalized) return true;
  }
  for (let current: ts.Node | undefined = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && /TAGS$/.test(current.name.text)) return true;
  }
  return false;
}

function typeScriptColorSites(source: string, path: string, includeSemanticPaint = false): { file: ts.SourceFile; sites: TypeScriptColorSite[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites: TypeScriptColorSite[] = [];
  const record = (value: string, node: ts.Node) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const systemColors = isStructuralSystemString(value, node) ? "none" : "exact";
    sites.push(...colorTokens(value, includeSemanticPaint, systemColors).map((token) => ({ line, nodeStart: node.getStart(file), token })));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) record(node.text, node);
    if (ts.isTemplateExpression(node)) {
      record(node.head.text, node.head);
      for (const span of node.templateSpans) record(span.literal.text, span.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, sites };
}

export function auditTypeScript(source: string, path: string): string[] {
  return typeScriptColorSites(source, path).sites.map((site) => issue(path, site.line, site.token));
}

function unwrap(expression: ts.Expression): ts.Expression {
  while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
  return expression;
}

function variableInitializer(file: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) return unwrap(declaration.initializer);
    }
  }
  return undefined;
}

function propertyName(property: ts.PropertyAssignment): string | undefined {
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined;
}

function evaluateObject(
  object: ts.ObjectLiteralExpression,
  spreads: Record<string, Record<string, string>>,
  allowedNodes: Set<number>,
  issues: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression) && spreads[property.expression.text]) {
      Object.assign(result, spreads[property.expression.text]);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      issues.push("unsupported palette member");
      continue;
    }
    const name = propertyName(property);
    const value = unwrap(property.initializer);
    if (!name || !ts.isStringLiteralLike(value)) {
      issues.push(`invalid palette property ${name ?? "unknown"}`);
      continue;
    }
    allowedNodes.add(value.getStart());
    result[name] = value.text;
  }
  return result;
}

function sameRecord(actual: Record<string, string>, expected: Record<string, string>): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function auditPaletteSource(
  source: string,
  allowlist: readonly string[],
  palette: Readonly<Record<"light" | "dark", Readonly<Record<string, string>>>>,
  path: string,
): string[] {
  const { file, sites } = typeScriptColorSites(source, path, true);
  const issues: string[] = [];
  const allowedNodes = new Set<number>();
  const allowlistExpression = variableInitializer(file, "INSTRUMENT_COLOR_ALLOWLIST");
  const declaredAllowlist = ts.isArrayLiteralExpression(allowlistExpression)
    ? allowlistExpression.elements.flatMap((element) => {
      const value = ts.isExpression(element) ? unwrap(element) : element;
      if (!ts.isStringLiteralLike(value)) return [];
      allowedNodes.add(value.getStart());
      return [value.text];
    })
    : [];
  if (JSON.stringify(declaredAllowlist) !== JSON.stringify(allowlist)) issues.push("palette allowlist differs from the declared contract");

  const sharedExpression = variableInitializer(file, "shared");
  const shared = ts.isObjectLiteralExpression(sharedExpression)
    ? evaluateObject(sharedExpression, {}, allowedNodes, issues)
    : {};
  const paletteExpression = variableInitializer(file, "INSTRUMENT_PALETTE");
  if (!ts.isObjectLiteralExpression(paletteExpression)) issues.push("missing INSTRUMENT_PALETTE object");
  for (const theme of ["light", "dark"] as const) {
    const property = ts.isObjectLiteralExpression(paletteExpression)
      ? paletteExpression.properties.find((candidate): candidate is ts.PropertyAssignment => ts.isPropertyAssignment(candidate) && propertyName(candidate) === theme)
      : undefined;
    const value = property ? unwrap(property.initializer) : undefined;
    const declared = ts.isObjectLiteralExpression(value)
      ? evaluateObject(value, { shared }, allowedNodes, issues)
      : {};
    if (!sameRecord(declared, { ...palette[theme] })) issues.push(`${theme} palette differs from the declared mapping`);
  }

  for (const value of [...declaredAllowlist, ...Object.values(shared), ...Object.values(palette.light), ...Object.values(palette.dark)]) {
    if (!/^#[\dA-F]{6}$/.test(value) || !allowlist.includes(value)) issues.push(`unallowlisted palette value ${value}`);
  }
  issues.push(...sites.filter((site) => !allowedNodes.has(site.nodeStart)).map((site) => issue(path, site.line, site.token)));
  return issues;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function auditTokenCss(
  source: string,
  allowlist: readonly string[],
  palette: Readonly<Record<"light" | "dark", Readonly<Record<string, string>>>>,
  path: string,
): string[] {
  const startMarker = "/* instrument-token-definitions:start */";
  const endMarker = "/* instrument-token-definitions:end */";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < start || start !== source.lastIndexOf(startMarker) || end !== source.lastIndexOf(endMarker)) return [`${path}:invalid token definition markers`];
  const block = source.slice(start + startMarker.length, end);
  const outside = source.slice(0, start) + source.slice(end + endMarker.length);
  const issues = auditCss(outside, path);
  let root: postcss.Root;
  try {
    root = postcss.parse(block, { from: path });
  } catch (error) {
    return [...issues, `${path}:parse:${error instanceof Error ? error.message : String(error)}`];
  }
  const actual = { light: {} as Record<string, string>, dark: {} as Record<string, string> };
  root.each((node) => {
    if (node.type !== "rule") issues.push(`${path}:unsupported token block node ${node.type}`);
  });
  root.walkDecls((declaration) => {
    const rule = declaration.parent as Rule;
    const compactSelector = rule.selector?.replace(/\s/g, "") ?? "";
    const theme = compactSelector === 'html[data-theme="light"]' ? "light"
      : compactSelector === ':root,html[data-theme="dark"]' ? "dark"
        : undefined;
    if (theme && declaration.prop === "color-scheme" && declaration.value === theme) return;
    if (!theme || !declaration.prop.startsWith("--instrument-")) {
      issues.push(`${path}:${declaration.source?.start?.line ?? 1}:invalid token declaration ${declaration.prop}`);
      return;
    }
    const name = declaration.prop.slice("--instrument-".length);
    if (name in actual[theme]) issues.push(`${path}:duplicate ${theme} token ${name}`);
    if (!/^#[\dA-F]{6}$/.test(declaration.value) || !allowlist.includes(declaration.value)) issues.push(`${path}:unallowlisted ${theme} token ${declaration.prop}:${declaration.value}`);
    actual[theme][name] = declaration.value;
  });
  for (const theme of ["light", "dark"] as const) {
    const expected = Object.fromEntries(Object.entries(palette[theme]).map(([name, value]) => [kebabCase(name), value]));
    if (!sameRecord(actual[theme], expected)) issues.push(`${path}:${theme} token block differs from the palette`);
  }
  return issues;
}

export function auditAssetManifest(
  assets: Readonly<Record<string, Uint8Array>>,
  manifest: Readonly<Record<string, string>>,
): string[] {
  const issues: string[] = [];
  const actualPaths = Object.keys(assets).sort();
  const expectedPaths = Object.keys(manifest).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) issues.push("visual asset paths differ from the exact manifest");
  for (const path of expectedPaths) {
    const bytes = assets[path];
    if (!bytes) continue;
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== manifest[path]) issues.push(`${path}:sha256:${digest}`);
  }
  return issues;
}
