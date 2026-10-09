import styles from "./apartments-studios.module.css";
import { resolveApartmentsStudiosMedia } from "./media";

type Props = {
  assetId?: string | null;
  className?: string;
  label?: string;
};

export function ApartmentsStudiosMedia({ assetId, className, label }: Props) {
  const { src, alt } = resolveApartmentsStudiosMedia(assetId);
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
