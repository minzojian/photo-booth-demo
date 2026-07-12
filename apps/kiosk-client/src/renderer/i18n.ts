/**
 * Kiosk Client i18n — simple key-value translations for zh/en
 * 大头贴终端国际化（中/英文切换）
 */

export type Lang = 'zh' | 'en';

const zh: Record<string, string> = {
  // Welcome / 欢迎页
  'welcome.title': '大头贴自助机',
  'welcome.start': '开始拍照',
  'welcome.tap': '轻触屏幕开始',

  // Mode / 选择张数
  'mode.title': '选择模板',
  'mode.shots': '{n}张',
  'mode.shotCount': '{n} 张',
  'mode.back': '返回',
  'mode.start': '开始拍摄',

  // Shoot / 拍照
  'shoot.ready': '准备',
  'shoot.smile': '笑一个!',
  'shoot.next': '下一张',
  'shoot.retake': '重拍',
  'shoot.allDone': '全部拍完!',

  // Edit / 编辑
  'edit.title': '编辑照片',
  'edit.filter': '滤镜',
  'edit.sticker': '贴纸',
  'edit.done': '完成编辑',
  'edit.heading': '后期编辑 · 贴纸 & 相框',
  'edit.cancelBack': '取消, 返回首页',
  'edit.prev': '上一张',
  'edit.next': '下一张',
  'edit.composing': '⏳ 合成预览中…',
  'edit.stickerHint': '点击贴纸,然后点图片放置',

  // Result / 结果页
  'result.title': '拍照完成!',
  'result.print': '打印照片',
  'result.qr': '生成二维码下载',
  'result.newSession': '再来一组',
  'result.backHome': '返回首页',
  'result.uploading': '上传中...',
  'result.uploaded': '扫码下载照片',
  'result.uploadError': '上传失败，请重试',
  'result.processing': '处理中...',

  // Lock / 锁定
  'lock.title': '设备已被管理员锁定',
  'lock.desc': '指令 {id} · 来自 {from}(演示:等待解锁)',

  // Admin Panel / 管理面板
  'admin.title': '管理面板',
  'admin.verify': '管理员验证',
  'admin.pin': '请输入管理密码',
  'admin.pin.error': '密码错误',
  'admin.pin.submit': '确认',
  'admin.pin.cancel': '取消',

  // Admin Tabs / 管理面板标签
  'admin.tab.tasks': '上传任务',
  'admin.tab.system': '系统状态',
  'admin.tab.about': '关于与更新',
  'admin.tab.settings': '本地存储',
  'admin.tab.printer': '打印机',

  // Printer / 打印机
  'printer.title': '打印机',
  'printer.empty': '未检测到打印机',
  'printer.status.idle': '就绪',
  'printer.status.active': '打印中',
  'printer.status.unavailable': '不可用',
  'printer.default': '默认',
  'printer.testPrint': '测试打印',
  'printer.hint': '点击「测试打印」可在系统打印对话框中选择打印机（包括虚拟 PDF 打印机）',

  // Tasks / 上传任务
  'tasks.empty': '暂无任务',
  'tasks.count': '本地 SQLite 上传队列(共 {n} 条)',
  'tasks.cleared': '本地已清除',

  // System / 系统状态
  'system.disk': '磁盘剩余(本机数据盘)',
  'system.memory': '内存占用',
  'system.cpu': 'CPU',
  'system.uptime': '已运行',
  'system.load': '负载',
  'system.cpuDetail': '{cores} 核 CPU · 负载 {load}',
  'system.deviceLabel': '设备ID / 已运行',
  'system.deviceId': '设备ID',
  'system.version': '版本',
  'system.platform': '平台',
  'system.arch': '架构',

  // About / 关于与更新
  'about.version': '当前版本',
  'about.product': '产品',
  'about.check': '检查更新',
  'about.checking': '检查中...',
  'about.uptodate': '已是最新版本',
  'about.available': '发现新版本',
  'about.download': '下载更新',
  'about.downloading': '下载中',
  'about.installing': '安装中...',
  'about.restart': '重启安装',
  'about.none': '已是最新版本',
  'about.error': '检查失败',
  'about.idleHint': '点击"检查更新"从更新服务器拉取最新版本',
  'about.downloadDelta': '（完整包 {fullSize} MB，节省 {total}%）',
  'about.downloadFull': '（完整包 {size} MB）',
  'about.diag': '诊断',
  'about.installUnsupported': '当前为手动更新模式：可检测新版本，但不执行自动安装（开发模式或 macOS ad-hoc 签名）。',
  'about.phase.idle': '空闲',
  'about.phase.checking': '检查中',
  'about.phase.downloading': '下载中',
  'about.phase.downloaded': '已下载',
  'about.phase.installing': '安装中',
  'about.autoUpdate': '自动静默升级',
  'about.autoUpdate.desc': '每日0～8点自动检查并下载，等待设备空闲 5 分钟后自动安装重启。',
  'about.quit': '退出程序',

  // Settings / 本地存储设置
  'settings.title': '本地照片保留策略',
  'settings.desc': '超过保留期限的照片文件夹将自动清理（启动时 + 每 6 小时）。 文件存放路径:',
  'settings.path': 'photos/日期/订单号/',
  'settings.days.7': '7 天',
  'settings.days.14': '14 天',
  'settings.days.30': '1 个月',

  // Language / 语言
  'language.label': '界面语言 / Language',
  'language.zh': '中文',
  'language.en': 'English',

  // Common
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.loading': '加载中...',
  'common.retry': '重试',
};

const en: Record<string, string> = {
  // Welcome
  'welcome.title': 'Photo Booth',
  'welcome.start': 'Start',
  'welcome.tap': 'Tap screen to start',

  // Mode
  'mode.title': 'Select Template',
  'mode.shots': '{n} Shots',
  'mode.shotCount': '{n} Shots',
  'mode.back': 'Back',
  'mode.start': 'Start Shooting',

  // Shoot
  'shoot.ready': 'Ready',
  'shoot.smile': 'Smile!',
  'shoot.next': 'Next',
  'shoot.retake': 'Retake',
  'shoot.allDone': 'All Done!',

  // Edit
  'edit.title': 'Edit Photo',
  'edit.filter': 'Filter',
  'edit.sticker': 'Stickers',
  'edit.done': 'Done',
  'edit.heading': 'Post Editing · Stickers & Frames',
  'edit.cancelBack': 'Cancel, Back to Home',
  'edit.prev': 'Previous',
  'edit.next': 'Next',
  'edit.composing': '⏳ Composing preview…',
  'edit.stickerHint': 'Tap a sticker, then tap the photo to place it',

  // Result
  'result.title': 'Photo Ready!',
  'result.print': 'Print',
  'result.qr': 'Generate QR to Download',
  'result.newSession': 'New Session',
  'result.backHome': 'Back to Home',
  'result.uploading': 'Uploading...',
  'result.uploaded': 'Scan QR to download',
  'result.uploadError': 'Upload failed, please retry',
  'result.processing': 'Processing...',

  // Lock
  'lock.title': 'Device Locked by Admin',
  'lock.desc': 'Command {id} · from {from} (demo: waiting for unlock)',

  // Admin Panel
  'admin.title': 'Admin Panel',
  'admin.verify': 'Admin Verification',
  'admin.pin': 'Enter admin PIN',
  'admin.pin.error': 'Invalid PIN',
  'admin.pin.submit': 'Submit',
  'admin.pin.cancel': 'Cancel',

  // Admin Tabs
  'admin.tab.tasks': 'Upload Tasks',
  'admin.tab.system': 'System',
  'admin.tab.about': 'About & Update',
  'admin.tab.settings': 'Storage',
  'admin.tab.printer': 'Printer',

  // Printer
  'printer.title': 'Printer',
  'printer.empty': 'No printer detected',
  'printer.status.idle': 'Ready',
  'printer.status.active': 'Printing',
  'printer.status.unavailable': 'Unavailable',
  'printer.default': 'Default',
  'printer.testPrint': 'Test Print',
  'printer.hint': 'Click "Test Print" to open the system print dialog (supports virtual PDF printers)',

  // Tasks
  'tasks.empty': 'No tasks',
  'tasks.count': 'SQLite upload queue ({n} total)',
  'tasks.cleared': 'Cleared locally',

  // System
  'system.disk': 'Disk (data partition)',
  'system.memory': 'Memory',
  'system.cpu': 'CPU',
  'system.uptime': 'Uptime',
  'system.load': 'Load',
  'system.cpuDetail': '{cores}-core CPU · Load {load}',
  'system.deviceLabel': 'Device ID / Uptime',
  'system.deviceId': 'Device ID',
  'system.version': 'Version',
  'system.platform': 'Platform',
  'system.arch': 'Architecture',

  // About
  'about.version': 'Current Version',
  'about.product': 'Product',
  'about.check': 'Check for Updates',
  'about.checking': 'Checking...',
  'about.uptodate': 'Up to date',
  'about.available': 'New version available',
  'about.download': 'Download',
  'about.downloading': 'Downloading',
  'about.installing': 'Installing...',
  'about.restart': 'Restart to Install',
  'about.none': 'Up to date',
  'about.error': 'Check failed',
  'about.idleHint': 'Click "Check for Updates" to fetch the latest version',
  'about.downloadDelta': '(Full package {fullSize} MB, saved {total}%)',
  'about.downloadFull': '(Full package {size} MB)',
  'about.diag': 'Diagnostics',
  'about.installUnsupported': 'Manual update mode: can detect new version, but auto-install is disabled (dev mode or macOS ad-hoc signature).',
  'about.phase.idle': 'Idle',
  'about.phase.checking': 'Checking',
  'about.phase.downloading': 'Downloading',
  'about.phase.downloaded': 'Downloaded',
  'about.phase.installing': 'Installing',
  'about.autoUpdate': 'Auto Silent Update',
  'about.autoUpdate.desc': 'Auto-check daily 0-8 AM, install after 5 min idle then restart.',
  'about.quit': 'Quit',

  // Settings
  'settings.title': 'Photo Retention Policy',
  'settings.path': 'photos/date/orderId/',
  'settings.desc': 'Photo folders exceeding retention will be auto-cleaned (on startup + every 6h). Path:',
  'settings.days.7': '7 Days',
  'settings.days.14': '14 Days',
  'settings.days.30': '1 Month',

  // Language
  'language.label': 'Language / 语言',
  'language.zh': '中文',
  'language.en': 'English',

  // Common
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.loading': 'Loading...',
  'common.retry': 'Retry',
};

const locales: Record<Lang, Record<string, string>> = { zh, en };

/**
 * Simple i18n translate function.
 * Supports {key} placeholders, e.g. t('mode.shots', { n: 4 }) => "4张" / "4 Shots"
 */
export function createT(lang: Lang) {
  const dict = locales[lang] || zh;
  return (key: string, vars?: Record<string, string | number>): string => {
    let text = dict[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

export type TFunc = ReturnType<typeof createT>;
