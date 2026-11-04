import { expect, test } from 'bun:test'
import { loadSharp } from './host'
import { markScreenshot } from './marks'
import { readScreen } from './operator'

test('截图上画出编号框：尺寸不变、内容变了；坏图原样返回', async () => {
  const sharp = loadSharp()
  expect(sharp).not.toBeNull()
  // 截图按屏幕一半缩小，编号框要按比例换算
  const image = new Uint8Array(
    await sharp!({ create: { width: 500, height: 1000, channels: 3, background: '#ffffff' } })
      .jpeg()
      .toBuffer(),
  )
  const screen = readScreen({
    width: 1000,
    height: 2000,
    nodes: [{ text: '推荐', clickable: true, bounds: [100, 100, 400, 300] }],
  })
  const marked = await markScreenshot(image, screen)
  const meta = await sharp!(marked).metadata()
  expect([meta.width, meta.height]).toEqual([500, 1000])
  expect(Buffer.compare(Buffer.from(marked), Buffer.from(image))).not.toBe(0)
  // 元素左上角 (100,100) 换算到截图是 (50,50)，编号标签是实心红块
  const { data, info } = await sharp!(marked).raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3))
  const [r, g, b] = at(56, 58)
  expect(r).toBeGreaterThan(200)
  expect(g).toBeLessThan(120)
  expect(b).toBeLessThan(150)
  const broken = new Uint8Array([1, 2, 3])
  expect(await markScreenshot(broken, screen)).toBe(broken)
})
