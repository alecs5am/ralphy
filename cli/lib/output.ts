let _pretty = false;

export function setPretty(v: boolean) {
  _pretty = v;
}

export function isPretty() {
  return _pretty;
}

export function out(data: unknown) {
  if (_pretty) {
    if (Array.isArray(data)) {
      printTable(data);
    } else if (typeof data === "object" && data !== null) {
      printObject(data as Record<string, unknown>);
    } else {
      console.log(data);
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function ok(message: string) {
  if (_pretty) {
    console.log(`  ✓ ${message}`);
  }
}

export function err(message: string): never {
  console.error(_pretty ? `  ✗ ${message}` : JSON.stringify({ error: message }));
  process.exit(1);
}

function printTable(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    console.log("  No items");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length))
  );

  // Header
  console.log(
    "  " + keys.map((k, i) => k.padEnd(widths[i])).join("  ")
  );
  console.log(
    "  " + widths.map((w) => "─".repeat(w)).join("  ")
  );
  // Rows
  for (const row of rows) {
    console.log(
      "  " + keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  ")
    );
  }
  console.log(`\n  ${rows.length} items`);
}

function printObject(obj: Record<string, unknown>, indent = 2) {
  const pad = " ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      console.log(`${pad}${k}:`);
      printObject(v as Record<string, unknown>, indent + 2);
    } else if (Array.isArray(v)) {
      console.log(`${pad}${k}: ${v.join(", ")}`);
    } else {
      console.log(`${pad}${k}: ${v}`);
    }
  }
}
