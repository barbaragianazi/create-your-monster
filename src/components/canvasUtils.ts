export function svgToImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}
