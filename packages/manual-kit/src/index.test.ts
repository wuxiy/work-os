import { describe, expect, it } from 'vitest'
import { buildIndex, docToMarkdown, loadMetadata, normalizeCommandDoc, validateDocs } from './index'

const UPSTREAM = { repo: 'https://github.com/jaywcjlove/linux-command', ref: 'master', commands: [] }

const SAMPLE_MD = `# systemctl

> systemctl 是 Systemd 的主命令，用于管理系统服务。

## 示例

\`\`\`shell
systemctl status nginx
systemctl start nginx
\`\`\`

## 相关命令

- service
- journalctl
`

describe('manual-kit（验收 L2/L3）', () => {
  it('normalize 抽取标题/摘要/章节/分类', () => {
    const meta = loadMetadata('系统管理:\n  - systemctl\n', 'systemctl:\n  - service\n', 'systemctl:\n  - systemd\n')
    const d = normalizeCommandDoc('systemctl', SAMPLE_MD, meta, UPSTREAM)
    expect(d.title).toBe('systemctl')
    expect(d.summary).toContain('Systemd')
    expect(d.category).toBe('系统管理')
    expect(d.aliases).toEqual(['service'])
    expect(d.tags).toEqual(['systemd'])
    expect(d.sections.map((s) => s.heading)).toEqual(['示例', '相关命令'])
    expect(d.sections[0]!.body).toContain('systemctl status nginx')
    expect(d.source?.name).toBe(UPSTREAM.repo)
  })

  it('真实上游结构：命令名 + === + 代码块注释不被误当标题', () => {
    const meta = loadMetadata('', '', '')
    const raw = [
      'systemctl',
      '===',
      '',
      'Systemd服务管理器',
      '',
      '### 安装',
      '',
      '```shell',
      '# systemd通常是系统的基础组件，大多数Linux发行版已预装',
      'systemctl --version',
      '```',
    ].join('\n')
    const d = normalizeCommandDoc('systemctl', raw, meta, UPSTREAM)
    expect(d.title).toBe('systemctl')
    expect(d.summary).toBe('Systemd服务管理器')
  })

  it('ls 的真实上游摘要', () => {
    const meta = loadMetadata('', '', '')
    const raw = ['ls', '===', '', '用来显示目录列表', ''].join('\n')
    const d = normalizeCommandDoc('ls', raw, meta, UPSTREAM)
    expect(d.title).toBe('ls')
    expect(d.summary).toBe('用来显示目录列表')
  })

  it('分类猜测兜底', () => {
    const meta = loadMetadata('', '', '')
    expect(normalizeCommandDoc('curl', '', meta, UPSTREAM).category).toBe('网络工具')
    expect(normalizeCommandDoc('ls', '', meta, UPSTREAM).category).toBe('文件管理')
    expect(normalizeCommandDoc('zzz-unknown', '', meta, UPSTREAM).category).toBe('其他')
  })

  it('validate 捕获非法文档', () => {
    const errs = validateDocs([
      { id: '', title: 'x', sections: [{ heading: '', body: 'y' }] },
      { id: 'a', title: '', sections: [] },
      { id: 'a', title: '重复', sections: [{ heading: '', body: '' }] },
    ])
    expect(errs.length).toBeGreaterThanOrEqual(3)
  })

  it('build 产出的 markdown 往返', () => {
    const meta = loadMetadata('', '', '')
    const d = normalizeCommandDoc('systemctl', SAMPLE_MD, meta, UPSTREAM)
    const md = docToMarkdown(d)
    expect(md).toContain('## 示例')
    expect(md).toContain('> systemctl 是')
    const idx = buildIndex([d])
    expect(idx.index.documents[0]!.contentFile).toBe('systemctl.md')
  })
})
