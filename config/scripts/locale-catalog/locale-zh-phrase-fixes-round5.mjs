// Chinese phrase fixes from high-visibility UI audit round 5.
export const ZH_PHRASE_FIXES_ROUND5 = [
  { pattern: /Markov集成开发环境/g, replacement: 'Markov IDE', whenEnIncludes: 'Markov IDE' },
  { pattern: /Markov第一/g, replacement: 'Markov 优先', whenEnIncludes: 'Markov first' },
  { pattern: /Markov移动/g, replacement: 'Markov Mobile', whenEnIncludes: 'Markov Mobile' },
  { pattern: /Markov标志/g, replacement: 'Markov 标志', whenEnIncludes: 'Markov logo' },
  { pattern: /喜欢Markov/g, replacement: '喜欢 Markov', whenEnIncludes: 'Enjoying Markov' },
  { pattern: /认识Markov/g, replacement: '了解 Markov', whenEnIncludes: 'Get to know Markov' },
  { pattern: /支持Markov/g, replacement: '支持 Markov', whenEnIncludes: 'Support Markov' },
  { pattern: /展开Markov/g, replacement: '展开 Markov', whenEnIncludes: 'Expand Markov' },
  { pattern: /来自Markov/g, replacement: '来自 Markov', whenEnIncludes: 'from Markov' },
  {
    pattern: /正在重新启动Markov/g,
    replacement: '正在重启 Markov',
    whenEnIncludes: 'Restarting Markov'
  },
  { pattern: /Markov([\u4e00-\u9fff])/g, replacement: 'Markov $1', whenEnIncludes: 'Markov' },
  { pattern: /Linear([\u4e00-\u9fff])/g, replacement: 'Linear $1', whenEnIncludes: 'Linear' },
  { pattern: /Codex([\u4e00-\u9fff])/g, replacement: 'Codex $1', whenEnIncludes: 'Codex' },
  { pattern: /Claude([\u4e00-\u9fff])/g, replacement: 'Claude $1', whenEnIncludes: 'Claude' },
  { pattern: /Claude代码/g, replacement: 'Claude Code', whenEnIncludes: 'Claude Code' },
  { pattern: /GitHub 和Linear/g, replacement: 'GitHub 和 Linear', whenEnIncludes: 'Linear tasks' },
  { pattern: /托管审阅/g, replacement: '托管评审', whenEnIncludes: 'hosted-review' },
  { pattern: /托管审阅/g, replacement: '托管评审', whenEnIncludes: 'Hosted-review' },
  { pattern: /审阅笔记/g, replacement: '评审笔记', whenEnIncludes: 'review note' },
  { pattern: /审阅任务/g, replacement: '评审任务', whenEnIncludes: 'review task' },
  { pattern: /待审阅/g, replacement: '待评审', whenEnIncludes: 'need review' },
  { pattern: /重新审核/g, replacement: '重新评审', whenEnIncludes: 'Re-review' },
  { pattern: /依赖项审核/g, replacement: '依赖项审计', whenEnIncludes: 'dependency audit' },
  { pattern: /Git AI 作者/g, replacement: 'Git AI Author', whenEnIncludes: 'Git AI Author' },
  { pattern: /基本引用/g, replacement: '基础引用', whenEnIncludes: 'base ref' },
  { pattern: /重新开放PR/g, replacement: '重新打开 PR', whenEnIncludes: 'Reopen PR' },
  { pattern: /重新开放/g, replacement: '重新打开', whenEnIncludes: 'reopen' },
  { pattern: /受限制的钥匙/g, replacement: '受限制的密钥', whenEnIncludes: 'restricted keys' },
  { pattern: /更换钥匙/g, replacement: '更换密钥', whenEnIncludes: 'Replace key' },
  {
    pattern: /根据所看到的内容采取行动/g,
    replacement: '根据所看到的内容执行操作',
    whenEnIncludes: 'act on what they see'
  },
  {
    pattern: /建议下一步行动/g,
    replacement: '建议下一步操作',
    whenEnIncludes: 'suggest next actions'
  },
  {
    pattern: /可操作的问题/g,
    replacement: '需处理的问题',
    whenEnIncludes: 'actionable issues'
  },
  {
    pattern: /显示 Markov 移动按钮/g,
    replacement: '显示 Markov Mobile 按钮',
    whenEnIncludes: 'Show Markov Mobile Button'
  }
]
