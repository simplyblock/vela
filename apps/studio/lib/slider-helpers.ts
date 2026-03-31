export type SliderKey = 'vcpu' | 'ram' | 'iops' | 'nvme' | 'storage'

const FULL_VCPU_THRESHOLD = 8
const FULL_RAM_THRESHOLD = 16

export function calculateSliderDefault(min: number, max: number, step: number, factor: number): number {
  const baseMaximum = Math.max(min, max * factor)
  const cleanDivisor = Math.floor(baseMaximum / step)
  return cleanDivisor * step
}

export function snapValue(key: SliderKey, value: number) {
  if (key === 'vcpu' && value > FULL_VCPU_THRESHOLD) {
    return Math.round(value)
  }

  if (key === 'ram' && value > FULL_RAM_THRESHOLD) {
    return Math.round(value)
  }

  return value
}

