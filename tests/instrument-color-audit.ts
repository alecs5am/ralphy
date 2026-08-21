import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
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

type SystemColorMode = "none" | "all";

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

function tokensInNormalizedValue(normalized: string, includeSemanticPaint = false, systemColors: SystemColorMode = "none"): string[] {
  const patterns = [HEX_COLOR, COLOR_FUNCTION, NAMED_COLOR, ...(includeSemanticPaint ? [SEMANTIC_PAINT] : [])];
  const tokens = patterns.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...normalized.matchAll(pattern)].map((match) => match[0]);
  });
  if (systemColors === "all") {
    SYSTEM_COLOR.lastIndex = 0;
    tokens.push(...[...normalized.matchAll(SYSTEM_COLOR)].map((match) => match[0]));
  }
  return tokens;
}

function colorTokens(value: string, includeSemanticPaint = false, systemColors: SystemColorMode = "none"): string[] {
  return tokensInNormalizedValue(decodeCssEscapes(value), includeSemanticPaint, systemColors);
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function unmistakableColorTokens(value: string): string[] {
  const normalized = decodeCssEscapes(value);
  return uniqueTokens([HEX_COLOR, COLOR_FUNCTION].flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...normalized.matchAll(pattern)].map((match) => match[0]);
  }));
}

function decodePercentRuns(value: string): string {
  return value.replace(/(?:%[\dA-F]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

function dataUrlTokens(value: string): string[] {
  const normalized = decodeCssEscapes(value);
  const tokens: string[] = [];
  const pattern = /data:([\w.+-]+\/[\w.+-]+)((?:;[^,]*)?),/gi;
  for (const match of normalized.matchAll(pattern)) {
    const mime = match[1].toLowerCase();
    if (!mime.startsWith("image/") && !mime.startsWith("text/") && !/^application\/(?:svg\+xml|xml|json)$/.test(mime)) continue;
    const payloadStart = (match.index ?? 0) + match[0].length;
    const encoded = normalized.slice(payloadStart);
    let decoded: string;
    try {
      decoded = /(?:^|;)base64(?:;|$)/i.test(match[2])
        ? Buffer.from(encoded.match(/^[\w+/=-]*/)?.[0] ?? "", "base64").toString("utf8")
        : decodePercentRuns(encoded);
    } catch {
      decoded = encoded;
    }
    const authored = colorTokens(decoded, false, "all");
    tokens.push(...(authored.length > 0 ? authored : ["data-url"]));
  }
  return uniqueTokens(tokens);
}

function cssPaintSource(value: string): string {
  let unquoted = "";
  for (let index = 0; index < value.length;) {
    const current = value[index];
    if (current === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      const length = (end < 0 ? value.length : end + 2) - index;
      unquoted += " ".repeat(length);
      index += length;
      continue;
    }
    if (current === "\"" || current === "'") {
      const quote = current;
      const start = index++;
      while (index < value.length) {
        if (value[index] === "\\") {
          index += Math.min(2, value.length - index);
          continue;
        }
        if (value[index++] === quote) break;
      }
      const quoted = value.slice(start, index);
      unquoted += /^['"]\s*data:/i.test(decodeCssEscapes(quoted)) ? quoted : " ".repeat(index - start);
      continue;
    }
    unquoted += current;
    index += 1;
  }

  const decoded = decodeCssEscapes(unquoted);
  const masked = [...decoded];
  const nonPaintFunctions = /(?<![\w-])(?:url|counter|counters)\s*\(/gi;
  for (const match of decoded.matchAll(nonPaintFunctions)) {
    const start = match.index;
    let index = start + match[0].length;
    let depth = 1;
    while (index < decoded.length && depth > 0) {
      if (decoded[index] === "(") depth += 1;
      if (decoded[index] === ")") depth -= 1;
      index += 1;
    }
    if (/^url/i.test(match[0]) && /data:/i.test(decoded.slice(start, index))) continue;
    masked.fill(" ", start, index);
  }
  return masked.join("");
}

function issue(path: string, line: number, token: string): string {
  return `${path}:${line}:${token}`;
}

const PAINT_PROPERTIES = new Set([
  "accent-color", "backdrop-filter", "background", "background-color", "background-image",
  "border", "border-block", "border-block-color", "border-block-end", "border-block-end-color",
  "border-block-start", "border-block-start-color", "border-bottom", "border-bottom-color", "border-color",
  "border-image", "border-image-source", "border-inline", "border-inline-color", "border-inline-end",
  "border-inline-end-color", "border-inline-start", "border-inline-start-color", "border-left", "border-left-color",
  "border-right", "border-right-color", "border-top", "border-top-color", "box-reflect", "box-shadow",
  "caret-color", "color", "column-rule", "column-rule-color", "content", "fill", "filter", "flood-color",
  "lighting-color", "list-style-image", "mask", "mask-border", "mask-border-source", "mask-box-image",
  "mask-box-image-source", "mask-image", "outline", "outline-color", "override-colors", "scrollbar-color",
  "shape-outside", "solid-color", "stop-color", "stroke", "tap-highlight-color", "text-decoration",
  "text-decoration-color", "text-emphasis", "text-emphasis-color", "text-fill-color", "text-shadow",
  "text-stroke", "text-stroke-color",
]);

function normalizeCssProperty(property: string): string {
  return decodeCssEscapes(property).trim().replace(/^-?(?:webkit|moz|ms|o)-/i, "").toLowerCase();
}

function isPaintProperty(property: string): boolean {
  const normalized = normalizeCssProperty(property);
  return normalized.startsWith("--") || PAINT_PROPERTIES.has(normalized);
}

function cssPropertyColorTokens(property: string, value: string): string[] {
  const source = cssPaintSource(value);
  const data = dataUrlTokens(value);
  if (normalizeCssProperty(property) === "content" && !/(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(source)) return data;
  return uniqueTokens([...data, ...tokensInNormalizedValue(source, false, "all")]);
}

function isPaintDeclaration(declaration: postcss.Declaration): boolean {
  if (isPaintProperty(declaration.prop)) return true;
  if (normalizeCssProperty(declaration.prop) !== "initial-value" || declaration.parent?.type !== "atrule") return false;
  return declaration.parent.name.toLowerCase() === "property";
}

function cssDeclarationColorTokens(declaration: postcss.Declaration): string[] {
  return uniqueTokens([
    ...unmistakableColorTokens(declaration.value),
    ...dataUrlTokens(declaration.value),
    ...(isPaintDeclaration(declaration) ? cssPropertyColorTokens(declaration.prop, declaration.value) : []),
  ]);
}

function parenthesizedValues(value: string): Array<{ callee: string; value: string }> {
  const results: Array<{ callee: string; value: string }> = [];
  const stack: Array<{ callee: string; start: number }> = [];
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (quote) {
      if (current === "\\") index += 1;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "\"" || current === "'") {
      quote = current;
      continue;
    }
    if (current === "(") {
      const callee = value.slice(0, index).match(/([\w-]+)\s*$/)?.[1]?.toLowerCase() ?? "";
      stack.push({ callee, start: index + 1 });
      continue;
    }
    if (current === ")") {
      const group = stack.pop();
      if (group) results.push({ callee: group.callee, value: value.slice(group.start, index) });
    }
  }
  return results;
}

function declarationFragmentTokens(value: string): string[] {
  if (!/^\s*(?:--|[-_a-z])[-\w]*\s*:/i.test(value)) return [];
  try {
    const root = postcss.parse(`.audit { ${value} }`);
    const tokens: string[] = [];
    root.walkDecls((declaration) => {
      tokens.push(...cssDeclarationColorTokens(declaration));
    });
    return uniqueTokens(tokens);
  } catch {
    return [];
  }
}

interface CssColorSite {
  line: number;
  token: string;
}

function cssRootColorSites(root: postcss.Root): CssColorSite[] {
  const sites: CssColorSite[] = [];
  root.walkDecls((declaration) => {
    sites.push(...cssDeclarationColorTokens(declaration).map((token) => ({
      line: declaration.source?.start?.line ?? 1,
      token,
    })));
  });
  root.walkAtRules((rule) => {
    sites.push(...uniqueTokens([
      ...unmistakableColorTokens(rule.params),
      ...dataUrlTokens(rule.params),
    ]).map((token) => ({
      line: rule.source?.start?.line ?? 1,
      token,
    })));
    const name = rule.name.toLowerCase();
    if (name !== "supports" && name !== "container") return;
    for (const group of parenthesizedValues(rule.params)) {
      if (name === "container" && group.callee !== "style") continue;
      sites.push(...declarationFragmentTokens(group.value).map((token) => ({
        line: rule.source?.start?.line ?? 1,
        token,
      })));
    }
  });
  return sites;
}

export function auditCss(source: string, path: string): string[] {
  try {
    const root = postcss.parse(source, { from: path });
    return cssRootColorSites(root).map((site) => issue(path, site.line, site.token));
  } catch (error) {
    return [`${path}:parse:${error instanceof Error ? error.message : String(error)}`];
  }
}

interface TypeScriptColorSite {
  line: number;
  nodeStart: number;
  token: string;
}

function enclosingVariable(node: ts.Node): string | undefined {
  for (let current: ts.Node | undefined = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
  }
  return undefined;
}

function isProjectPath(path: string, expected: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized === expected || normalized.endsWith(`/${expected}`);
}

function isStructuralSystemString(value: string, node: ts.Node, path: string): boolean {
  const normalized = decodeCssEscapes(value).trim().toLowerCase();
  const overlayRegistry = isProjectPath(path, "src/instrument/overlay-registry.tsx");
  if (!EXACT_SYSTEM_COLOR.test(normalized)) return false;
  if (overlayRegistry && normalized === "menu" && ts.isLiteralTypeNode(node.parent)) {
    const declaration = node.parent.parent;
    const alias = ts.isTypeAliasDeclaration(declaration) ? declaration : ts.isUnionTypeNode(declaration) && ts.isTypeAliasDeclaration(declaration.parent) ? declaration.parent : undefined;
    if (alias?.name.text === "InstrumentOverlayKind") return true;
    if (enclosingVariable(node) === "overlayRoles") return true;
  }
  if (normalized === "menu" && ts.isJsxAttribute(node.parent)) {
    const name = node.parent.name.getText().toLowerCase();
    if (name === "role" || name === "aria-haspopup") return true;
  }
  if (ts.isPropertyAssignment(node.parent)) {
    const name = ts.isIdentifier(node.parent.name) || ts.isStringLiteral(node.parent.name) ? node.parent.name.text.toLowerCase() : "";
    const owner = enclosingVariable(node);
    if (overlayRegistry && normalized === "menu" && owner === "INSTRUMENT_OVERLAYS" && name === "kind") return true;
    if (overlayRegistry && normalized === "menu" && owner === "overlayRoles" && name === "menu") return true;
  }
  return normalized === "mark"
    && isProjectPath(path, "src/components/MarkdownView.tsx")
    && enclosingVariable(node) === "SAFE_HTML_TAGS"
    && ts.isArrayLiteralExpression(node.parent);
}

function syntaxPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression) ? name.expression.text : undefined;
}

function assignmentPropertyName(expression: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text;
  }
  return undefined;
}

function typescriptPropertyName(value: string): string {
  return value
    .replace(/^ms([A-Z])/, "ms-$1")
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
}

function embeddedCssTokens(value: string): string[] | undefined {
  const stylesheet = /[{}]/.test(value) && /(?:--|[-_a-z])[-\w]*\s*:/i.test(value);
  const declarations = /(?:^|;)\s*(?:--|[-_a-z])[-\w]*\s*:/i.test(value) && !value.includes("://");
  if (!stylesheet && !declarations) return undefined;
  try {
    const root = postcss.parse(stylesheet ? value : `.audit { ${value} }`);
    return cssRootColorSites(root).map((site) => site.token);
  } catch {
    return undefined;
  }
}

const SIMPLE_COLOR_WORDS = new Set<string>(CSS_NAMED_COLORS);
const BORDER_WIDTHS = new Set(["thin", "medium", "thick"]);
const BORDER_STYLES = new Set(["none", "hidden", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]);
const BACKGROUND_KEYWORDS = new Set([
  "border-box", "padding-box", "content-box", "text", "repeat", "no-repeat", "space", "round",
  "scroll", "fixed", "local", "left", "right", "top", "bottom", "center", "cover", "contain",
]);

function isSimpleColorWord(value: string): boolean {
  return SIMPLE_COLOR_WORDS.has(value.toLowerCase()) || /^#[\dA-F]{3,8}$/i.test(value);
}

function isCssLength(value: string): boolean {
  return /^(?:0|-?(?:\d*\.)?\d+(?:px|r?em|ch|ex|%|vw|vh|vmin|vmax))$/i.test(value);
}

function isBorderWidth(value: string): boolean {
  return isCssLength(value) || BORDER_WIDTHS.has(value.toLowerCase());
}

function standalonePaintTokens(value: string, includeSemanticPaint: boolean): string[] {
  const normalized = decodeCssEscapes(value).trim();
  const tokens = tokensInNormalizedValue(normalized, includeSemanticPaint, "none");
  if (tokens.length === 0) return [];
  if (tokens.some((token) => token.toLowerCase() === normalized.toLowerCase())) return tokens;
  if (/(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(normalized)) return tokens;

  const paintSource = cssPaintSource(value);
  if (/(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(|(?:color-mix|light-dark|drop-shadow)\s*\(/i.test(paintSource)) return tokens;
  const parts = paintSource.trim().split(/\s+/);
  const colors = parts.filter(isSimpleColorWord).length;
  const widths = parts.filter(isBorderWidth).length;
  const styles = parts.filter((part) => BORDER_STYLES.has(part.toLowerCase())).length;
  if (colors > 0 && widths > 0 && styles > 0
    && parts.every((part) => isSimpleColorWord(part) || isBorderWidth(part) || BORDER_STYLES.has(part.toLowerCase()))) return tokens;
  if (colors > 0 && parts.some((part) => part.toLowerCase() === "auto")
    && parts.every((part) => isSimpleColorWord(part) || isCssLength(part) || part.toLowerCase() === "auto")) return tokens;
  if (colors > 0 && parts.some((part) => BACKGROUND_KEYWORDS.has(part.toLowerCase()))
    && parts.every((part) => isSimpleColorWord(part) || BACKGROUND_KEYWORDS.has(part.toLowerCase()))) return tokens;
  if (colors > 0 && parts.filter(isCssLength).length >= 2
    && parts.every((part) => isSimpleColorWord(part) || isCssLength(part) || part.toLowerCase() === "inset")) return tokens;
  return [];
}

interface StaticString {
  value: string;
  node: ts.StringLiteralLike;
}

function variableBindings(file: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return bindings;
}

function directStaticString(expression: ts.Expression): StaticString | undefined {
  const value = unwrap(expression);
  if (ts.isStringLiteralLike(value)) return { value: value.text, node: value };
  if (ts.isCallExpression(value) && value.arguments.length === 1 && ts.isIdentifier(value.expression) && value.expression.text === "String") {
    return directStaticString(value.arguments[0]);
  }
  return undefined;
}

function resolveStaticString(expression: ts.Expression, bindings: Map<string, ts.Expression>): StaticString | undefined {
  const direct = directStaticString(expression);
  if (direct) return direct;
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) {
    const initializer = bindings.get(value.text);
    return initializer ? directStaticString(initializer) : undefined;
  }
  const member = ts.isPropertyAccessExpression(value)
    ? { owner: value.expression, name: value.name.text }
    : ts.isElementAccessExpression(value) && value.argumentExpression
      ? { owner: value.expression, name: resolveStaticString(value.argumentExpression, bindings)?.value }
      : undefined;
  if (!member?.name || !ts.isIdentifier(member.owner)) return undefined;
  const owner = bindings.get(member.owner.text);
  const object = owner ? unwrap(owner) : undefined;
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const property = object.properties.find((candidate): candidate is ts.PropertyAssignment =>
    ts.isPropertyAssignment(candidate) && syntaxPropertyName(candidate.name) === member.name);
  return property ? directStaticString(property.initializer) : undefined;
}

function resolvedPropertyName(name: ts.PropertyName, bindings: Map<string, ts.Expression>): string | undefined {
  const direct = syntaxPropertyName(name);
  if (direct) return direct;
  return ts.isComputedPropertyName(name) ? resolveStaticString(name.expression, bindings)?.value : undefined;
}

function resolvedAssignmentPropertyName(expression: ts.Expression, bindings: Map<string, ts.Expression>): string | undefined {
  const direct = assignmentPropertyName(expression);
  if (direct) return direct;
  return ts.isElementAccessExpression(expression) && expression.argumentExpression
    ? resolveStaticString(expression.argumentExpression, bindings)?.value
    : undefined;
}

function isStyleObjectProperty(property: ts.PropertyAssignment): boolean {
  const owner = enclosingVariable(property);
  if (owner && /styles?$/i.test(owner)) return true;
  const object = property.parent;
  const container = object.parent;
  if (ts.isPropertyAssignment(container)) return typescriptPropertyName(syntaxPropertyName(container.name) ?? "") === "style";
  if (ts.isJsxExpression(container) && ts.isJsxAttribute(container.parent)) return container.parent.name.getText().toLowerCase() === "style";
  return ts.isVariableDeclaration(container) && /CSSProperties|CSSStyleDeclaration/.test(container.type?.getText() ?? "");
}

function typeScriptPaintProperty(node: ts.Node, bindings: Map<string, ts.Expression>): string | undefined {
  for (let current: ts.Node = node; current.parent && !ts.isSourceFile(current.parent); current = current.parent) {
    const parent = current.parent;
    if (ts.isPropertyAssignment(parent)) {
      if (parent.name === current) return undefined;
      const name = resolvedPropertyName(parent.name, bindings);
      if (name && isPaintProperty(typescriptPropertyName(name))) return name;
      return isStyleObjectProperty(parent) ? "--style-value" : undefined;
    }
    if (ts.isJsxAttribute(parent)) {
      const name = parent.name.getText();
      return isPaintProperty(typescriptPropertyName(name)) ? name : name.toLowerCase() === "style" ? "--style-value" : undefined;
    }
    if (ts.isBinaryExpression(parent) && parent.right === current) {
      if (parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return undefined;
      const name = resolvedAssignmentPropertyName(parent.left, bindings);
      return name && isPaintProperty(typescriptPropertyName(name)) ? name : undefined;
    }
    if (ts.isCallExpression(parent)) {
      const argument = parent.arguments.indexOf(current as ts.Expression);
      const method = ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.text : "";
      if (argument === 1 && (method === "setProperty" || method === "setAttribute")) {
        const name = resolveStaticString(parent.arguments[0], bindings)?.value;
        return name && isPaintProperty(typescriptPropertyName(name)) ? name : undefined;
      }
      if (!(ts.isIdentifier(parent.expression) && parent.expression.text === "String")) return undefined;
    }
    if (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isImportDeclaration(parent)
      || ts.isExportDeclaration(parent) || ts.isFunctionLike(parent) || ts.isClassLike(parent)) return undefined;
  }
  return undefined;
}

function typeScriptColorSites(source: string, path: string, includeSemanticPaint = false): { file: ts.SourceFile; sites: TypeScriptColorSite[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const bindings = variableBindings(file);
  const sites: TypeScriptColorSite[] = [];
  const seen = new Set<string>();
  const record = (value: string, node: ts.Node, paintProperty?: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const context = paintProperty ?? typeScriptPaintProperty(node, bindings);
    const embedded = embeddedCssTokens(value);
    const global = [...unmistakableColorTokens(value), ...dataUrlTokens(value)];
    const contextual = includeSemanticPaint
      ? colorTokens(value, true, "all")
      : embedded ?? (context && isPaintProperty(typescriptPropertyName(context))
        ? cssPropertyColorTokens(typescriptPropertyName(context), value)
        : standalonePaintTokens(value, false));
    const tokens = uniqueTokens([...global, ...contextual])
      .filter((token) => !EXACT_SYSTEM_COLOR.test(token) || !isStructuralSystemString(value, node, path));
    for (const token of tokens) {
      const key = `${node.getStart(file)}:${token.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sites.push({ line, nodeStart: node.getStart(file), token });
    }
  };
  const recordExpression = (expression: ts.Expression, property: string) => {
    const resolved = resolveStaticString(expression, bindings);
    if (resolved) record(resolved.value, resolved.node, property);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) record(node.text, node);
    if (ts.isTemplateExpression(node)) {
      record(node.head.text + node.templateSpans.map((span) => `0${span.literal.text}`).join(""), node);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = resolvedPropertyName(node.name, bindings);
      if (name && isPaintProperty(typescriptPropertyName(name))) recordExpression(node.initializer, name);
      else if (isStyleObjectProperty(node)) recordExpression(node.initializer, "--style-value");
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = resolvedAssignmentPropertyName(node.left, bindings);
      if (name && isPaintProperty(typescriptPropertyName(name))) recordExpression(node.right, name);
    }
    if (ts.isCallExpression(node)) {
      const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if ((method === "setProperty" || method === "setAttribute") && node.arguments.length >= 2) {
        const name = resolveStaticString(node.arguments[0], bindings)?.value;
        if (name && isPaintProperty(typescriptPropertyName(name))) recordExpression(node.arguments[1], name);
      }
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value && (isPaintProperty(typescriptPropertyName(name)) || typescriptPropertyName(name) === "style")) {
        recordExpression(value, name === "style" ? "--style-value" : name);
      }
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
