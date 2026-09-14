"use client";

import { useEffect, useState } from "react";
import { LG_MEDIA_QUERY } from "../lib/workspace-constants";

export function useIsLgViewport() {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(LG_MEDIA_QUERY);
    const sync = () => setIsLg(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isLg;
}
