// 解析飞书「消息导出到文档 → 下载为 Markdown」的正文。
// 每条消息形如：「发送人 2026年7月6日 14:32」单独一行，其后是正文、图片引用或附件标记。
// 合并转发的聊天记录以 `---` 分隔线包住，内部消息格式与外层一致。

const messageHeader = /^(\S[^\n]{0,40}?)\s(\d{4})年(\d{1,2})月(\d{1,2})日\s(\d{1,2}):(\d{2})$/
const imageLine = /^!\[[^\]]*\]\(([^)]+)\)$/
const fileLine = /^\\?\[\\?\[文件\\?\]\\?\]\s*(.+)$/
const videoLine = /^\\?\[视频\\?\]\s*(.*)$/
const forwardLine = /^\\?\[(.+?会话记录)\\?\]$/

/** 去掉飞书 Markdown 的转义反斜杠，并压缩空白。 */
function clean(value) {
  return String(value ?? '').replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1').replace(/[ \t]+/g, ' ').trim()
}

/** 把「2026年7月6日 14:32」转成可排序的本地时间字符串。 */
function toTimestamp(year, month, day, hour, minute) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

/**
 * 解析导出的 Markdown 正文。
 * @param {string} markdown 正文内容
 * @returns {{ title: string|null, messages: Array }} 会话标题与消息列表
 */
export function parseLarkChatMarkdown(markdown) {
  const rows = String(markdown ?? '').split(/\r?\n/)
  const messages = []
  let title = null
  let current = null
  // 合并转发块：遇到「[X与Y的会话记录]」后由成对的 --- 界定范围
  let forwardFrom = null
  let forwardDepth = 0

  const flush = () => {
    if (!current) return
    const text = clean(current.lines.join('\n'))
    if (text || current.images || current.files.length) messages.push({
      sender: current.sender,
      timestamp: current.timestamp,
      text,
      images: current.images,
      imageRefs: current.imageRefs,
      files: current.files,
      forwardedFrom: current.forwardedFrom,
    })
    current = null
  }

  for (const raw of rows) {
    const line = raw.trim()
    if (!title && line.startsWith('# ')) {
      title = clean(line.slice(2))
      continue
    }
    if (line.startsWith('> ')) continue

    const forward = forwardLine.exec(line)
    if (forward) {
      flush()
      forwardFrom = clean(forward[1])
      forwardDepth = 0
      continue
    }
    if (line === '---') {
      flush()
      if (forwardFrom) {
        forwardDepth += 1
        // 第一条分隔线开启转发块，第二条关闭
        if (forwardDepth >= 2) {
          forwardFrom = null
          forwardDepth = 0
        }
      }
      continue
    }

    const header = messageHeader.exec(line)
    if (header) {
      flush()
      current = {
        sender: clean(header[1]),
        timestamp: toTimestamp(header[2], header[3], header[4], header[5], header[6]),
        lines: [],
        images: 0,
        imageRefs: [],
        files: [],
        forwardedFrom: forwardFrom,
      }
      continue
    }
    if (!current) continue

    if (!line) {
      current.lines.push('')
      continue
    }
    if (imageLine.test(line)) {
      current.images += 1
      current.imageRefs.push(imageLine.exec(line)[1])
      continue
    }
    const file = fileLine.exec(line)
    if (file) {
      current.files.push(clean(file[1]))
      continue
    }
    const video = videoLine.exec(line)
    if (video) {
      current.files.push('[视频]')
      if (video[1]) current.lines.push(video[1])
      continue
    }
    current.lines.push(line)
  }
  flush()
  return { title, messages }
}

/** 同一会话多次导出会重叠，按发送人、时间和正文去重。 */
export function messageFingerprint(message) {
  return JSON.stringify([message.sender, message.timestamp, message.text, message.files ?? [], message.imageRefs ?? [], message.images ?? 0, message.forwardedFrom ?? null])
}

export function dedupeMessages(messages) {
  const seen = new Set()
  const result = []
  for (const message of messages) {
    const key = messageFingerprint(message)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(message)
  }
  return result.sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}

/** 从导出文件名推断会话名：「张三与李四的会话 2026年9月11日」→「张三与李四的会话」。 */
export function conversationNameFrom(title, fallback) {
  const source = clean(title) || clean(fallback)
  return source.replace(/\s*\d{4}年\d{1,2}月\d{1,2}日\s*$/, '').trim() || source
}
