import { loadSharp } from './host'
import type { Screen } from './operator'

/**
 * 在截图上给可点元素画编号框（Set-of-Mark），模型说「点 12」就不必自己估坐标。
 * 截图是缩小过的，元素坐标是屏幕像素，按比例换算；画不了（没有 sharp、图片异常）时返回原图。
 */
export async function markScreenshot(image: Uint8Array, screen: Screen): Promise<Uint8Array> {
  const sharp = loadSharp()
  if (!sharp || !screen.width || !screen.elements.length) return image
  try {
    const picture = sharp(image)
    const { width = 0, height = 0 } = await picture.metadata()
    if (!width || !height) return image
    const scale = width / screen.width
    const font = Math.max(14, Math.round(width / 40))
    const boxes = screen.elements
      .map((e) => {
        const [l, t, r, b] = e.bounds.map((n) => Math.round(n * scale)) as [number, number, number, number]
        const label = String(e.id)
        const tagWidth = Math.round(font * (0.62 * label.length + 0.5))
        const tagX = Math.min(Math.max(0, l), width - tagWidth)
        const tagY = Math.min(Math.max(0, t), height - font - 4)
        return `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="none" stroke="#ff2d55" stroke-width="2"/>
<rect x="${tagX}" y="${tagY}" width="${tagWidth}" height="${font + 4}" fill="#ff2d55"/>
<text x="${tagX + tagWidth / 2}" y="${tagY + font - 1}" font-size="${font}" font-family="Arial, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`
      })
      .join('\n')
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${boxes}</svg>`,
    )
    return new Uint8Array(
      await picture
        .composite([{ input: overlay }])
        .jpeg({ quality: 80 })
        .toBuffer(),
    )
  } catch {
    return image
  }
}
