import { describe, it } from 'vitest'

// Wave 0 stub — implementation filled in Phase 11.1 Plan 02 (Wave 1)
// D-15/D-16: handleFileUpload rejects files over 10MB with actionable message

describe('TemplatesTab size cap', () => {
  it.skip('rejects a file larger than 10MB with a message showing the actual size and instructions to compress images in Word', async () => {
    // TODO: render TemplatesTab with a mocked supabase + profile
    // create a File object with size > 10_485_760 bytes
    // trigger handleFileUpload with that File
    // verify setUploadError was called with a string containing the file size in MB
    // and containing 'compress' or 'Word'
  })
})
