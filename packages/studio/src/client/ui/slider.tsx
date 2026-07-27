"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "./cn";

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center data-disabled:opacity-50",
        className
      )}
      data-slot="slider"
      {...props}
    >
      <SliderPrimitive.Track
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        data-slot="slider-track"
      >
        <SliderPrimitive.Range
          className="absolute h-full bg-primary"
          data-slot="slider-range"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block size-4 shrink-0 cursor-pointer rounded-full border border-primary bg-background shadow-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed"
        data-slot="slider-thumb"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
