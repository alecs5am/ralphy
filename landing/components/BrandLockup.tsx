export function BrandLockup({ id }: { id: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3em",
        lineHeight: 1,
        verticalAlign: "-0.08em",
      }}
    >
      <img
        src={`/assets/brands/${id}-icon.svg`}
        alt=""
        height="1em"
        style={{ height: "0.95em", width: "auto", display: "block" }}
      />
      <img
        src={`/assets/brands/${id}-text.svg`}
        alt={id}
        height="1em"
        style={{ height: "0.95em", width: "auto", display: "block" }}
      />
    </span>
  );
}
