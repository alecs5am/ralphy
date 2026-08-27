export function RalphyMascot({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={`ralphy-mascot${className ? ` ${className}` : ""}`}
      src="./assets/ralphy-mascot.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
