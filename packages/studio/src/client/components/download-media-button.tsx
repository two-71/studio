"use client";

import { IconDownload } from "@tabler/icons-react";
import { toast } from "sonner";
import { downloadImage } from "../image-actions";
import { useStudioConfig } from "../studio-config-provider";
import type { StudioResult } from "../types";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Download control shared by the gallery card and the lightbox; the label and
 * file extension follow the result's media type.
 */
export function DownloadMediaButton({ result }: { result: StudioResult }) {
  const config = useStudioConfig();
  const video = result.mediaType === "video";
  const label = video ? "Download video" : "Download image";
  const filePrefix =
    (config.branding?.siteName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generation";

  const onDownload = async () => {
    try {
      await downloadImage(
        result.src,
        `${filePrefix}-${result.startedAt ?? Date.now()}.${video ? "mp4" : "png"}`
      );
    } catch {
      toast.error(`Couldn't download ${video ? "video" : "image"}`);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          onClick={onDownload}
          size="icon-sm"
          variant="ghost"
        >
          <IconDownload />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
