export function ThickBar({ value, color = "var(--brand)" }: { value: number; color?: string }) {
  return (
    <div style={{
      height: 12, borderRadius: 999, background: "var(--surface-2)",
      overflow: "hidden", border: "1px solid var(--border)",
    }}>
      <div style={{
        height: "100%", width: `${Math.min(value, 100)}%`,
        background: color, borderRadius: 999, transition: "width 0.6s ease",
      }} />
    </div>
  );
}

export function ThinBar({ value, max, color = "var(--brand)" }: { value: number; max: number; color?: string }) {
  return (
    <div style={{
      height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden",
    }}>
      <div style={{
        height: "100%", width: `${(value / max) * 100}%`,
        background: color, borderRadius: 999,
      }} />
    </div>
  );
}
