// Caption shape. Historically borrowed from `@remotion/captions`; kept the
// same field names so existing caption JSON files / generators continue to
// interop without conversion.

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};
