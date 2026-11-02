const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Your browser could not process this group picture"));
    }, "image/jpeg", quality);
  });
}

export async function prepareGroupImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP group picture");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose a group picture smaller than 25 MB");
  }
  if (file.size <= MAX_IMAGE_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This group picture could not be opened. Try another image");
  }

  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not process this group picture");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const qualities = attempt < 6 ? [0.9 - attempt * 0.08] : [0.42];
      for (const quality of qualities) {
        const blob = await canvasBlob(canvas, quality);
        if (blob.size <= MAX_IMAGE_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, "") || "group-picture";
          return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
        }
      }

      scale *= 0.8;
    }
    throw new Error("This picture could not be reduced below 2 MB. Choose a smaller image");
  } finally {
    bitmap.close();
  }
}
