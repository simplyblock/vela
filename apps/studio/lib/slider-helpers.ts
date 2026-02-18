export function calculateSliderDefault(min: number, max: number, step: number, factor: number): number {
  const baseMaximum = Math.max(min, max * factor)
  const cleanDivisor = Math.floor(baseMaximum / step)
  return cleanDivisor * step
}
