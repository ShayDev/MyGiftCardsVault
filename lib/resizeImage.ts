const TARGET_SPECS = {
  maxWidth: 1280,   // keeps small numbers & PIN text razor-sharp
  maxHeight: 1280,
  format: 'image/jpeg',
  quality: 0.75,    // drops most of the file size with ~no OCR legibility loss
} as const

/** Downscales/recompresses an image client-side before upload. Never upscales. Falls back to the original file if resizing fails for any reason. */
export async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, TARGET_SPECS.maxWidth / bitmap.width, TARGET_SPECS.maxHeight / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, TARGET_SPECS.format, TARGET_SPECS.quality)
    )
    if (!blob) return file

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: TARGET_SPECS.format })
  } catch {
    return file
  }
}
