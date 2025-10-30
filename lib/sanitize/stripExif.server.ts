// Server-side EXIF stripping utility
// TODO: Integrate sharp or exifr for production use

import type { NextRequest } from "next/server"

export async function stripExifFromForm(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("photo")

    if (!file || typeof file === "string") {
      return { buffer: null, filename: null }
    }

    const arrayBuf = await (file as File).arrayBuffer()

    // Placeholder: In production, use sharp to re-encode and strip EXIF
    // For now, return raw buffer (EXIF stripping not yet implemented)
    const buffer = Buffer.from(arrayBuf)
    const filename = (file as File).name.replace(/\.(heic|heif)$/i, ".jpg")

    return { buffer, filename }
  } catch (error) {
    console.error("Error processing photo upload:", error)
    return { buffer: null, filename: null }
  }
}
