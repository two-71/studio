"use client";

import { IconArrowsDiagonal, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { useStudioStore } from "../store/studio-store";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { PanelSection } from "./panel-section";

export function PromptField() {
  const prompt = useStudioStore((s) => s.prompt);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const [expanded, setExpanded] = useState(false);

  return (
    <PanelSection
      action={
        <Button
          aria-label="Expand prompt editor"
          className="size-5 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(true)}
          size="icon"
          variant="ghost"
        >
          <IconArrowsDiagonal className="size-3.5" />
        </Button>
      }
      icon={IconSparkles}
      label="Prompt"
    >
      <Textarea
        className="h-24 resize-none rounded-2xl bg-muted/40 text-base leading-relaxed md:text-[13px]"
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your image..."
        value={prompt}
      />
      <Dialog onOpenChange={setExpanded} open={expanded}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prompt</DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            className="min-h-[50vh] resize-none rounded-xl bg-muted/40 text-base leading-relaxed md:text-sm"
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your image..."
            value={prompt}
          />
        </DialogContent>
      </Dialog>
    </PanelSection>
  );
}
