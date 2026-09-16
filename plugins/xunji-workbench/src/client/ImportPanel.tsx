import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CONFIG_API_URL } from './api.js'

interface ImportedFile {
  readonly name: string
  readonly size: number
  readonly updatedAt: string
  readonly status?: 'pending' | 'indexed' | 'failed'
  readonly error?: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** 对话导入区：把飞书导出的 zip / md 存到本机导入目录，MCP 检索时自动重建索引。 */
export function ImportPanel({ onNotice }: { onNotice: (message: string) => void }): ReactNode {
  const [files, setFiles] = useState<readonly ImportedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${CONFIG_API_URL}/imports`, { cache: 'no-store' })
      const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[] }
      if (!response.ok || !body.ok || !body.files) throw new Error('无法读取导入目录。')
      setFiles(body.files)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取导入目录。')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const upload = async (list: FileList | null): Promise<void> => {
    if (busy || !list?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(list)) {
        if (file.size > 64 * 1024 * 1024) throw new Error(`${file.name} 超过 64 MB。`)
        const response = await fetch(`${CONFIG_API_URL}/imports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
          body: file,
        })
        const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[]; error?: string }
        if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? '上传失败。')
        setFiles(body.files)
      }
      const message = '已上传并通过格式校验；启用对话导入后，下次检索会建立索引。'
      setNotice(message)
      onNotice(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败。'
      setNotice(message)
      onNotice(message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(`${CONFIG_API_URL}/imports`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[]; error?: string }
      if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? '删除失败。')
      setFiles(body.files)
      setNotice(`已移除 ${name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败。')
    } finally {
      setBusy(false)
    }
  }

  return <div className="xunji-import" data-xunji-import-panel>
    <div className="xunji-config-panel__form-title"><span>导入对话文件</span><em>只保存在本机，不上传</em></div>
    <label
      className="xunji-import__drop"
      data-dragging={dragging || undefined}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files) }}
    >
      <input type="file" accept=".zip,.md,.markdown,.txt" multiple disabled={busy} onChange={(event) => { void upload(event.target.files); event.target.value = '' }}/>
      <strong>{busy ? '正在导入…' : '点击选择，或把文件拖到这里'}</strong>
      <span>支持飞书导出的 .zip（含图片）与 .md；可一次选多个</span>
    </label>
    {files.length > 0 && <ul className="xunji-import__list">
      {files.map((file) => <li key={file.name}>
        <span className="xunji-import__name" title={file.name}>{file.name}</span>
        <span className="xunji-import__meta">{formatSize(file.size)}</span>
        <span className="xunji-import__status" data-failed={file.status === 'failed' || undefined} title={file.error}>{file.status === 'indexed' ? '已索引' : file.status === 'failed' ? `解析失败：${file.error ?? '请重新导出'}` : '待检索时索引'}</span>
        <button type="button" disabled={busy} onClick={() => void remove(file.name)} aria-label={`移除 ${file.name}`}>移除</button>
      </li>)}
    </ul>}
    {notice ? <p className="xunji-config-panel__notice" role="status">{notice}</p> : null}
  </div>
}
