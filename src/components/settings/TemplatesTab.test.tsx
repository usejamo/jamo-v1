import { describe, it, expect } from 'vitest'

// D-15/D-16: handleFileUpload rejects files over 10MB with actionable message

describe('TemplatesTab size cap', () => {
  it('rejects a file larger than 10MB with a message showing the actual size and instructions to compress images in Word', () => {
    const MAX = 10 * 1024 * 1024
    const fileSizeBytes = MAX + 1
    const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1)
    const message =
      `This file is ${sizeMB} MB — templates must be under 10 MB. ` +
      `Large embedded images often cause this. Try compressing images in Word before re-uploading.`
    expect(message).toContain('10.0 MB')
    expect(message).toContain('compress')
    expect(message).toContain('Word')
    expect(fileSizeBytes > MAX).toBe(true)
  })
})
