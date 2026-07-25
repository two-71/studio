import { ControlsPanel } from "./controls-panel";
import { GenerateButton } from "./generate-button";
import { MobileControls } from "./mobile-controls";
import { ResultGallery } from "./result-gallery";
import { ResultLightbox } from "./result-lightbox";
import { StudioBrand } from "./studio-brand";
import { StudioHeader } from "./studio-header";
import { StudioNotch } from "./studio-notch";
import { StudioOptionsHydration } from "./studio-options-hydration";

// Rendered as <Studio>'s children (app/(studio)/studio/page.tsx) — config and
// user come from <Studio>'s context providers, so this layout takes no props
// of its own.
export function StudioShell() {
  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-sidebar">
      <StudioOptionsHydration />
      <aside className="hidden w-[288px] shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex items-center px-4 pt-4 pb-2">
          <StudioBrand />
        </div>
        <div className="relative min-h-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-sidebar to-transparent" />
          <div className="h-full overflow-y-auto px-4 py-3">
            <ControlsPanel />
          </div>
        </div>
        <div className="border-border border-t p-3">
          <GenerateButton />
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-sidebar">
        <StudioHeader />
        <ResultGallery />
        <StudioNotch />
      </main>

      <MobileControls />
      <ResultLightbox />
    </div>
  );
}
