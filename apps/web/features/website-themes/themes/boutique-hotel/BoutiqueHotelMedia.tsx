import styles from "./boutique-hotel.module.css";
import { resolveBoutiqueHotelMedia } from "./media";

type Props = {
  assetId?: string | null;
  className?: string;
  label?: string;
};

export function BoutiqueHotelMedia({ assetId, className, label }: Props) {
  const { src, alt } = resolveBoutiqueHotelMedia(assetId);
  if (!src) {
    return (
      <div
        className={`${styles.mediaFallback} ${className ?? ""}`}
        role="img"
        aria-label={label ?? alt}
      >
        {label ?? "Image"}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label ?? alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
