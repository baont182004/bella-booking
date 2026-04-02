export default function RoomHighlights({
  items = [],
  tone = "soft",
  className = "",
}) {
  if (!items.length) return null;

  const classes = ["room-chip-row", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {items.map((item) => (
        <span
          key={item}
          className={tone === "dark" ? "room-chip room-chip-dark" : "room-chip"}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
