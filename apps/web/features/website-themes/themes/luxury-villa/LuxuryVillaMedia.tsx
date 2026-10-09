import styles from "./luxury-villa.module.css";
import { resolveLuxuryVillaMedia } from "./media";

type Props = {
  assetId?: string | null;
  className?: string;
  label?: string;
};

export function LuxuryVillaMedia({ assetId, className, label }: Props) {
  const { src, alt } = resolveLuxuryVillaMedia(assetId);
  if (!src) {
    return (
      <div className={`${styles.mediaFallback} ${className ?? ""}`} role="img" aria-label={label ?? alt}>
        {label ?? "Image"}
      </div>
    );
  }
  return (
    // Local SVG placeholders — plain img is intentional for preview public assets.
    <img src={src} alt={label ?? alt} className={className} loading="lazy" decoding="async" />
  );
}
