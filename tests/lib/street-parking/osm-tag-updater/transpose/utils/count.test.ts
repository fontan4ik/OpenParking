import { describe, expect, test } from 'vitest'
import { count } from '@/lib/street-parking/osm-tag-updater/transpose/utils/count'

describe('count()', () => {
  test('retuns 0 if input empty', () => {
    const result = count('', '@')
    expect(result).toBe(0)
  })

  test('retuns 1', () => {
    const result = count('no @ (foo)', '@')
    expect(result).toBe(1)
  })

  test('retuns 2', () => {
    const result = count('no @ (foo); yes @ bar', '@')
    expect(result).toBe(2)
  })
})
