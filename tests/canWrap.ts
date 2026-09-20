import { drawWrapped } from '../src/components/canWrap'

/** Run in a real browser through Vite: import('/tests/canWrap.ts').then(m => m.testCanWrap()). */
export function testCanWrap() {
  const offsets = (left: number, right: number) => {
    const found: number[] = []
    drawWrapped(1000, left, right, (offset) => found.push(offset))
    return found.join(',')
  }
  const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }

  assert(offsets(100, 300) === '0', 'inside the canvas: a single copy')
  assert(offsets(-50, 100) === '0,1000', 'crossing x = 0: continues from the right edge')
  assert(offsets(900, 1050) === '0,-1000', 'crossing x = width: continues from the left edge')
  assert(offsets(1100, 1200) === '-1000', 'entirely past the right edge: only the wrapped copy')
  assert(offsets(-300, -100) === '1000', 'entirely before x = 0: only the wrapped copy')
  return { passed: 5 }
}
