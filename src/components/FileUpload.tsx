import { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

interface FileUploadProps {
  proposalId: string
  onUploadComplete?: (documentId: string) => void
}

interface UploadState {
  file: File
  status: 'uploading' | 'complete' | 'error'
  error?: string
  documentId?: string
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

function isValidFileType(file: File): boolean {
  return Object.keys(ACCEPTED_TYPES).includes(file.type) ||
    Object.values(ACCEPTED_TYPES).flat().some(ext => file.name.toLowerCase().endsWith(ext))
}

export function FileUpload({ proposalId, onUploadComplete }: FileUploadProps) {
  const { user, profile } = useAuth()
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!user || !profile) {
    throw new Error('FileUpload requires authenticated user with profile')
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const filesArray = Array.from(files)
    const newUploads: UploadState[] = filesArray.map(file => ({
      file,
      status: 'uploading' as const,
    }))

    setUploads(prev => [...prev, ...newUploads])

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i]
      const uploadIndex = uploads.length + i

      // Validate file type
      if (!isValidFileType(file)) {
        setUploads(prev => {
          const updated = [...prev]
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            status: 'error',
            error: 'Unsupported file type',
          }
          return updated
        })
        continue
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setUploads(prev => {
          const updated = [...prev]
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            status: 'error',
            error: 'File too large (max 50MB)',
          }
          return updated
        })
        continue
      }

      // Upload to storage
      const storagePath = `${profile.org_id}/${proposalId}/${file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        setUploads(prev => {
          const updated = [...prev]
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            status: 'error',
            error: uploadError.message,
          }
          return updated
        })
        continue
      }

      // Insert database record
      const { data: docData, error: docError } = await supabase
        .from('proposal_documents')
        .insert({
          org_id: profile.org_id,
          proposal_id: proposalId,
          uploaded_by: profile.id,
          name: file.name,
          storage_path: uploadData.path,
          mime_type: file.type,
          size_bytes: file.size,
          parse_status: 'pending',
        })
        .select()
        .single()

      if (docError) {
        // Cleanup storage on database error
        await supabase.storage.from('documents').remove([uploadData.path])
        setUploads(prev => {
          const updated = [...prev]
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            status: 'error',
            error: docError.message,
          }
          return updated
        })
        continue
      }

      // Success
      setUploads(prev => {
        const updated = [...prev]
        updated[uploadIndex] = {
          ...updated[uploadIndex],
          status: 'complete',
          documentId: docData.id,
        }
        return updated
      })

      // Trigger extraction (fire-and-forget — don't await)
      supabase.functions.invoke('extract-document', {
        body: { documentId: docData.id },
      }).catch(err => {
        console.error('Failed to trigger extraction:', err)
        setUploads(prev => prev.map(f =>
          f.file === file
            ? { ...f, status: 'error', error: 'Failed to start extraction' }
            : f
        ))
      })

      // Call onUploadComplete immediately (don't wait for extraction)
      if (onUploadComplete && docData.id) {
        onUploadComplete(docData.id)
      }
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleClick() {
    fileInputRef.current?.click()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
  }

  return (
    <div className="space-y-4">
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={"border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-colors " + (isDragging ? 'border-jamo-500 bg-jamo-50' : 'border-gray-300 hover:border-jamo-400 hover:bg-gray-50')}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Drag files here or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">Supports: PDF, DOCX, XLSX, TXT (max 50MB)</p>
          </div>
        </div>
      </div>
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" onChange={handleInputChange} className="hidden" />
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload, index) => (
            <div key={index} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="shrink-0">
                  {upload.status === 'uploading' && (
                    <svg className="animate-spin h-5 w-5 text-jamo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {upload.status === 'complete' && (
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {upload.status === 'error' && (
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{upload.file.name}</p>
                  {upload.error && <p className="text-xs text-red-600 mt-0.5">{upload.error}</p>}
                </div>
              </div>
              <div className="text-xs text-gray-500 ml-3 shrink-0">{(upload.file.size / 1024).toFixed(0)} KB</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
