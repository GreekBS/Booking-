import { HeroSection } from "./sections/HeroSection";
import { TrustStrip } from "./sections/TrustStrip";
import { PathsSection } from "./sections/PathsSection";
import { PlatformSection } from "./sections/PlatformSection";
import { WebsiteBuilderSection } from "./sections/WebsiteBuilderSection";
import { ManagedServiceSection } from "./sections/ManagedServiceSection";
import { SegmentsSection } from "./sections/SegmentsSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { FinalCtaSection } from "./sections/FinalCtaSection";

/**
 * Homepage pacing:
 * Brand → Choice → Product (Run) → Direct Presence (Grow) → Managed Service → Audience/How → Convert
 */
export function MarketingHomePage() {
  return (
    <>
      <HeroSection />
      <TrustStrip />
      <PathsSection />
      <PlatformSection />
      <WebsiteBuilderSection />
      <ManagedServiceSection />
      <SegmentsSection />
      <HowItWorksSection />
      <FinalCtaSection />
    </>
  );
}
