import type { Metadata } from "next";
import AtlasPreview from "@/features/atlas/AtlasPreview";

export const metadata: Metadata = {
  title: "Atlas of Knowledge · Static 3D Preview",
  robots: { index: false, follow: false },
};

export default function AtlasPreviewPage() {
  return <AtlasPreview />;
}
