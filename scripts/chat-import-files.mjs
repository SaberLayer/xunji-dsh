import { basename, extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'

// 上传、索引和解压共用上限，避免已接收的文件在索引时被静默跳过。
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024

export function readExportBuffer(name, buffer) {
  if (!buffer.length) throw new Error('文件内容为空。')
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error('导出文件不能超过 64 MB。')
  const extension = extname(name).toLowerCase()
  if (['.md', '.markdown', '.txt'].includes(extension)) return { name: basename(name), markdown: buffer.toString('utf8') }
  if (extension !== '.zip') return null

  const ensure = (offset, length) => {
    if (offset < 0 || length < 0 || offset + length > buffer.length) throw new Error('压缩包条目损坏。')
  }
  let end = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break }
  }
  if (end < 0) throw new Error('不是有效的压缩包。')
  const count = buffer.readUInt16LE(end + 10)
  let pointer = buffer.readUInt32LE(end + 16)
  for (let index = 0; index < count; index += 1) {
    ensure(pointer, 46)
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error('压缩包中央目录损坏。')
    const flags = buffer.readUInt16LE(pointer + 8)
    const method = buffer.readUInt16LE(pointer + 10)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const size = buffer.readUInt32LE(pointer + 24)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    ensure(pointer + 46, nameLength + extraLength + commentLength)
    const entryName = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    pointer += 46 + nameLength + extraLength + commentLength
    if (!entryName.toLowerCase().endsWith('.md')) continue
    if (flags & 1) throw new Error('不支持加密压缩包。')
    if (size > MAX_IMPORT_BYTES) throw new Error('解压后的正文不能超过 64 MB。')
    ensure(localOffset, 30)
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('压缩包条目损坏。')
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    ensure(start, compressedSize)
    if (method !== 0 && method !== 8) throw new Error(`不支持的压缩方式：${method}`)
    const data = buffer.subarray(start, start + compressedSize)
    // 同时限制实际输出，不能仅信任压缩包头部声明的大小。
    const body = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_IMPORT_BYTES })
    if (body.length > MAX_IMPORT_BYTES || body.length !== size) throw new Error('解压后正文大小与声明不符。')
    return { name: basename(entryName), markdown: body.toString('utf8') }
  }
  throw new Error('压缩包内没有 Markdown 正文。')
}
