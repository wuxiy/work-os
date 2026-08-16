/**
 * Manual Kit（技术架构 §20）：手册内容管线共享库
 * sync → normalize → validate → build → pack 的核心逻辑，供手册仓库脚本与 workos-cli 复用。
 */
import yaml from 'js-yaml'

/** 与 Rust 侧 workos_storage::ManualDocument 对齐 */
export interface ManualSection {
  heading: string
  body: string
}

export interface ManualSourceInfo {
  name: string
  url?: string
  license?: string
}

export interface ManualDocument {
  id: string
  title: string
  aliases?: string[]
  summary?: string
  category?: string
  tags?: string[]
  sections: ManualSection[]
  source?: ManualSourceInfo
}

export interface UpstreamConfig {
  repo: string
  ref: string
  rawBase?: string
  /** 命令子集（核心命令优先） */
  commands: string[]
  license?: string
}

export interface ManualMetadata {
  categories: Record<string, string[]>
  aliases: Record<string, string[]>
  tags: Record<string, string[]>
}

// ---------- normalize：从上游 markdown 抽取结构 ----------

/** 上游 jaywcjlove/linux-command 的 md 结构：`命令名\n===\n\n中文说明\n\n## 示例...` */
export function normalizeCommandDoc(id: string, raw: string, meta: ManualMetadata, upstream: UpstreamConfig): ManualDocument {
  const lines = raw.split('\n')

  // 跳过代码块：``` 围栏内的行不参与标题/摘要抽取
  const inFence = new Array<boolean>(lines.length).fill(false)
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i]!)) {
      fence = !fence
      inFence[i] = true
      continue
    }
    inFence[i] = fence
  }

  // 标题：代码块外的 `# xxx`；兜底为命令名（命令手册标题即命令名）
  let title = id
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue
    const m = /^#\s+(.+)$/.exec(lines[i]!.trim())
    if (m) {
      title = m[1]!.trim()
      break
    }
  }

  // setext 标题对（`命令名\n===`）中的标题行同样跳过
  const isSetextHeading = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(=+|-+)\s*$/.test(lines[i]!) && i > 0 && lines[i - 1]!.trim() && !inFence[i - 1]) {
      isSetextHeading[i] = true
      isSetextHeading[i - 1] = true
    }
  }

  // 摘要：> 引用行优先，否则取第一个非空、非标题、非 setext 的文本行（均需在代码块外）
  let summary = ''
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i] || isSetextHeading[i]) continue
    const t = lines[i]!.trim()
    if (!t || t.startsWith('#')) continue
    if (t.startsWith('>')) {
      summary = t.replace(/^>\s*/, '')
      break
    }
    if (/^(=+|-+)/.test(t)) continue
    if (/^[^\s#>|]/.test(t)) {
      summary = t
      break
    }
  }

  // 分类：metadata 优先，其次从内容猜测
  let category = ''
  for (const [cat, cmds] of Object.entries(meta.categories)) {
    if (cmds.includes(id)) {
      category = cat
      break
    }
  }
  if (!category) category = guessCategory(id, raw)

  // 章节：按 ## 切分
  const sections: ManualSection[] = []
  let current: ManualSection | null = null
  for (const l of lines) {
    const m = /^##+\s+(.+)$/.exec(l.trim())
    if (m) {
      if (current) sections.push(current)
      current = { heading: m[1]!.trim(), body: '' }
    } else if (current) {
      current.body += l + '\n'
    }
  }
  if (current) sections.push(current)
  if (sections.length === 0) {
    sections.push({ heading: '', body: raw })
  }

  return {
    id,
    title,
    aliases: meta.aliases[id] ?? [],
    summary: summary.slice(0, 200),
    category,
    tags: meta.tags[id] ?? [],
    sections,
    source: { name: upstream.repo, url: `${upstream.repo}/blob/${upstream.ref}/command/${id}.md`, license: upstream.license ?? '' },
  }
}

const CATEGORY_HINTS: Array<[string, RegExp]> = [
  ['文件管理', /^(ls|cd|pwd|cp|mv|rm|mkdir|rmdir|touch|cat|ln|find|tree|stat|file|rename|shred|which|whereis)\b/],
  ['文本处理', /^(grep|sed|awk|cut|sort|uniq|wc|head|tail|tr|tee|col|join|paste|split|fmt|nl|less|more)\b/],
  ['系统管理', /^(systemctl|service|journalctl|shutdown|reboot|top|htop|ps|kill|pkill|pgrep|nice|uname|hostname|uptime|who|free|lsof|crontab|useradd|usermod|passwd|su|sudo|chkconfig|init)\b/],
  ['网络工具', /^(curl|wget|ping|ssh|scp|ftp|telnet|netstat|ss|ifconfig|ip|dig|nslookup|host|traceroute|tcpdump|nc|nmap|route|arp)\b/],
  ['磁盘管理', /^(df|du|mount|umount|fdisk|parted|mkfs|fsck|sync|dd|lsblk|blkid|hdparm|quota)\b/],
  ['压缩解压', /^(tar|gzip|gunzip|zip|unzip|bzip2|xz|zcat|compress|rar|7z)\b/],
  ['包管理', /^(apt|apt-get|yum|dnf|brew|pacman|rpm|dpkg|npm|pip|gem|cargo|go)\b/],
  ['进程作业', /^(jobs|fg|bg|nohup|screen|tmux|expect|wait|trap|times)\b/],
  ['Shell 内建', /^(echo|printf|export|alias|set|unset|env|exec|source|read|declare|local|exit|history|type|shift|xargs)\b/],
  ['编程开发', /^(git|docker|make|gcc|g\+\+|java|python|perl|ruby|node|strings|objdump|nm|gdb|ldd)\b/],
]

function guessCategory(id: string, raw: string): string {
  for (const [cat, re] of CATEGORY_HINTS) {
    if (re.test(id)) return cat
  }
  if (/守护进程|服务/.test(raw.slice(0, 500))) return '系统管理'
  return '其他'
}

// ---------- validate：schema 校验（L3） ----------

export interface ValidationError {
  id: string
  message: string
}

export function validateDocs(docs: ManualDocument[]): ValidationError[] {
  const errors: ValidationError[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    if (!d.id || !/^[\w.-]+$/.test(d.id)) errors.push({ id: d.id, message: 'id 必须是字母数字._-' })
    if (seen.has(d.id)) errors.push({ id: d.id, message: 'id 重复' })
    seen.add(d.id)
    if (!d.title) errors.push({ id: d.id, message: '缺少 title' })
    if (!d.sections?.length) errors.push({ id: d.id, message: '缺少 sections' })
    for (const [i, s] of (d.sections ?? []).entries()) {
      if (typeof s.body !== 'string') errors.push({ id: d.id, message: `sections[${i}].body 必须是字符串` })
    }
  }
  return errors
}

// ---------- build：产出 dist 三件套 ----------

export interface BuiltIndex {
  documents: Array<ManualDocument & { contentFile: string }>
}

export function buildIndex(docs: ManualDocument[]): { index: BuiltIndex } {
  return {
    index: {
      documents: docs.map((d) => ({ ...d, contentFile: `${d.id}.md` })),
    },
  }
}

export function docToMarkdown(d: ManualDocument): string {
  const parts: string[] = []
  if (d.summary) parts.push(`> ${d.summary}\n`)
  for (const s of d.sections) {
    if (s.heading) parts.push(`## ${s.heading}\n`)
    parts.push(s.body.trim() + '\n')
  }
  return parts.join('\n')
}

// ---------- metadata 加载 ----------

export function loadMetadata(catsYaml: string, aliasesYaml: string, tagsYaml: string): ManualMetadata {
  return {
    categories: (yaml.load(catsYaml) as ManualMetadata['categories']) ?? {},
    aliases: (yaml.load(aliasesYaml) as ManualMetadata['aliases']) ?? {},
    tags: (yaml.load(tagsYaml) as ManualMetadata['tags']) ?? {},
  }
}
