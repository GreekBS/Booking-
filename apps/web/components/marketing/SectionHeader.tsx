export function SectionHeader({
  kicker,
  title,
  lede,
  align = "left",
}: {
  kicker?: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {kicker ? <p className="talos-kicker">{kicker}</p> : null}
      <h2 className="talos-display mt-3 text-balance text-3xl font-semibold tracking-tight text-[var(--talos-ink)] md:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
        {title}
      </h2>
      {lede ? <p className="talos-lede mt-4 text-pretty">{lede}</p> : null}
    </div>
  );
}
