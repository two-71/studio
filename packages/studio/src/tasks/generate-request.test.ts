import { describe, expect, test } from "bun:test";
import { downloadControlImages } from "./generate-request";

describe("downloadControlImages", () => {
  test("downloads a reference image when enhancement is disabled", async () => {
    const downloadedKeys: string[] = [];
    const storage = {
      getBase64: (key: string) => {
        downloadedKeys.push(key);
        return Promise.resolve(`${key}-data`);
      },
    };

    const [poseImage, referenceImage] = await downloadControlImages(storage, {
      enhance: false,
      poseImageKey: "pose.png",
      referenceImageKey: "reference.png",
    });

    expect(poseImage).toBeUndefined();
    expect(referenceImage).toBe("reference.png-data");
    expect(downloadedKeys).toEqual(["reference.png"]);
  });

  test("downloads both images when enhancement is enabled", async () => {
    const storage = {
      getBase64: (key: string) => Promise.resolve(`${key}-data`),
    };

    const [poseImage, referenceImage] = await downloadControlImages(storage, {
      enhance: true,
      poseImageKey: "pose.png",
      referenceImageKey: "reference.png",
    });

    expect(poseImage).toBe("pose.png-data");
    expect(referenceImage).toBe("reference.png-data");
  });
});
