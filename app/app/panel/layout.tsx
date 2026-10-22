import { Suspense } from "react";
import { EsqueletoMarco } from "@/components/panel/EsqueletoPanel";
import { MarcoPanelProtegido } from "@/components/panel/MarcoPanel";

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<EsqueletoMarco />}>
      <MarcoPanelProtegido>{children}</MarcoPanelProtegido>
    </Suspense>
  );
}
