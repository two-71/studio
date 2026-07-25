"use client";

import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Button } from "../ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";
import { ControlsPanel } from "./controls-panel";
import { GenerateButton } from "./generate-button";

/** Bottom action bar + control drawer, shown below the lg breakpoint. */
export function MobileControls() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-border border-t bg-background/95 p-3 lg:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <Button className="h-11 flex-1 rounded-2xl" variant="outline">
            <IconAdjustmentsHorizontal />
            Controls
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Image settings</DrawerTitle>
            <DrawerDescription>
              Set your prompt, model, ratio and resolution.
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <ControlsPanel />
          </div>
          <div className="p-4">
            <DrawerClose asChild>
              <GenerateButton />
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
      <GenerateButton className="flex-1" />
    </div>
  );
}
