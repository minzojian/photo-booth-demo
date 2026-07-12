import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { FILTERS, STICKERS, COUNTDOWN_SECONDS } from './booth/boothConfig'
import type { Filter } from './booth/boothConfig'
import { captureSquareFromVideo, composeWithTemplate } from './booth/compose'
import type { Shot, PlacedSticker } from './booth/compose'
import { loadTemplates, templatesForShotCount } from './booth/templates'
import type { Template, FrameDef } from './booth/templates'
import type { KioskTask, RemoteCommandView, SystemStatus, UpdateEvent, AppSettings, PrinterInfo } from './env'
import { createT, type Lang, type TFunc } from './i18n'

type Stage = 'welcome' | 'mode' | 'shoot' | 'edit' | 'result'
type AdminStage = 'hidden' | 'pin' | 'open'
type Tab = 'tasks' | 'system' | 'about' | 'settings' | 'printer'
let idc = 0
const uid = () => `id_${Date.now()}_${idc++}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const CDN_BASE = 'https://static.lunastudio.cn/'

export default function App() {
  // booth flow
  const [stage, setStage] = useState<Stage>('welcome')
  const [shotCount, setShotCount] = useState(4)
  const [templates, setTemplates] = useState<Template[]>([])
  const [template, setTemplate] = useState<Template | null>(null)
  const [filter, setFilter] = useState<Filter>(FILTERS[1])
  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const [lastCapture, setLastCapture] = useState<string | null>(null)
  const allDone = template ? frameIdx >= template.frames.length : false
  const [shots, setShots] = useState<Shot[]>([])
  const [editSelected, setEditSelected] = useState(0)
  const [composedImage, setComposedImage] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [activeSticker, setActiveSticker] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lock, setLock] = useState<RemoteCommandView | null>(null)
  // result 阶段
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // admin
  const [admin, setAdmin] = useState<AdminStage>('hidden')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [tab, setTab] = useState<Tab>('tasks')
  const [tasks, setTasks] = useState<KioskTask[]>([])
  const [sys, setSys] = useState<SystemStatus | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printersLoaded, setPrintersLoaded] = useState(false)
  const [version, setVersion] = useState('...')
  const [upd, setUpd] = useState<{
    phase: string
    msg?: string
    version?: string
    percent?: number
    transferred?: number
    total?: number
    totalSize?: number
    downloadSize?: number
    diag?: string
  }>({ phase: 'idle' })
  const [updateInstallSupported, setUpdateInstallSupported] = useState(false)
  // settings
  const [appSettings, setAppSettings] = useState<AppSettings>({
    retentionDays: 7,
    autoUpdateEnabled: false,
    language: 'zh',
  })

  // i18n
  const t: TFunc = createT(appSettings.language)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const editRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)
  const taps = useRef<number[]>([])
  const tplScrollRef = useRef<HTMLDivElement>(null)
  const tplDragRef = useRef({ active: false, startX: 0, startLeft: 0, moved: false, pointerId: -1 })
  const tplSuppressClickRef = useRef(false)
  const installAfterDownloadRef = useRef(false)
  // refs 供 useEffect 读取最新值，避免闭包陈旧
  const shotsRef = useRef<Shot[]>([])
  const templateRef = useRef<Template | null>(null)

  // 保持 refs 同步
  useEffect(() => {
    shotsRef.current = shots
  }, [shots])
  useEffect(() => {
    templateRef.current = template
  }, [template])

  // 进入编辑阶段时自动合成模板+照片
  useEffect(() => {
    if (stage !== 'edit') return
    const tpl = templateRef.current
    const s = shotsRef.current
    console.log(
      '[compose] 进入编辑, template:',
      tpl?.name,
      'shots:',
      s.length,
      'bgUrl前50字:',
      tpl?.bgUrl?.slice(0, 50),
    )
    if (!tpl || s.length === 0) {
      console.warn('[compose] 跳过合成: template或shots为空')
      setComposing(false)
      return
    }
    setComposedImage(null)
    setComposing(true)
    composeWithTemplate(s, tpl)
      .then((c) => {
        const url = c.toDataURL('image/png')
        console.log('[compose] 合成成功, canvas:', c.width + 'x' + c.height, 'dataURL长度:', url.length)
        setComposedImage(url)
        setComposing(false)
      })
      .catch((err) => {
        console.error('[compose] 合成失败:', err)
        setComposing(false)
      })
  }, [stage])
  useEffect(() => {
    window.kiosk.getVersion().then(setVersion)
    window.kiosk.getSettings().then(setAppSettings)
    window.kiosk.isUpdateInstallSupported().then(setUpdateInstallSupported)
  }, [])
  // 进入管理面板 → 关于与更新 → 自动检查
  useEffect(() => {
    if (admin === 'open' && tab === 'about') {
      window.kiosk.update.check()
    }
  }, [admin, tab])
  useEffect(() => {
    loadTemplates()
      .then((list) => {
        console.log('[templates] 加载完成, 数量:', list.length)
        setTemplates(list)
        const first = templatesForShotCount(list, shotCount)[0] || list[0]
        if (first) setTemplate(first)
      })
      .catch((e) => {
        console.error('[templates] 加载失败:', e)
      })
  }, [])
  useEffect(() => {
    window.kiosk.onCommand((cmd) => {
      if (cmd.type === 'LOCK') setLock(cmd)
      else if (cmd.type === 'UNLOCK') setLock(null)
      else {
        setToast(cmd.type === 'SHUTDOWN' ? '收到「关机」指令(演示:仅提示)' : '收到「重启」指令(演示:仅提示)')
        setTimeout(() => setToast(null), 4000)
      }
    })
    window.kiosk.onAdminHotkey(() => openPin())
    window.kiosk.update.onEvent((e: UpdateEvent) => {
      if (e.type === 'checking') setUpd({ phase: 'checking' })
      else if (e.type === 'available') setUpd({ phase: 'available', version: e.version, totalSize: e.totalSize })
      else if (e.type === 'none') setUpd({ phase: 'none', version: e.version })
      else if (e.type === 'diag') {
        console.log('[update-ui][diag]', e.message)
        setUpd((prev) => ({ ...prev, diag: e.message }))
      }
      else if (e.type === 'error') {
        setUpd({ phase: 'error', msg: e.message })
      } else if (e.type === 'progress')
        setUpd((prev) => ({
          phase: 'downloading',
          percent: e.percent ?? 0,
          transferred: e.transferred,
          total: e.total,
          downloadSize: prev.downloadSize ?? e.total,
          totalSize: prev.totalSize,
        }))
      else if (e.type === 'downloaded') {
        console.log('[update-ui] downloaded version:', e.version)
        setUpd({ phase: 'downloaded', version: e.version })
      }
    })
  }, [])

  const handleDownload = useCallback(() => {
    if (upd.phase !== 'available') return
    if (!updateInstallSupported) {
      return
    }
    console.log('[update-ui] 开始下载...')
    window.kiosk.update.download().catch((err) => {
      setUpd({ phase: 'error', msg: (err as Error).message || '下载失败' })
    })
  }, [upd.phase, updateInstallSupported])

  const handleInstall = useCallback(() => {
    if (upd.phase !== 'downloaded') return
    console.log('[update-ui] 手动触发安装重启...')
    setUpd({ phase: 'installing', version: upd.version })
    window.kiosk.update.install().catch((err) => {
      setUpd({ phase: 'error', msg: (err as Error).message || '安装失败' })
    })
  }, [upd.phase, upd.version])

  const startCameraOnly = useCallback(async () => {
    setCamError(null)
    setCamReady(false)
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1600 }, height: { ideal: 1200 }, aspectRatio: { ideal: 4 / 3 } },
          audio: false,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ])
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCamReady(true)
      console.log('[kiosk] 摄像头已就绪')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[kiosk] 摄像头失败:', msg)
      setCamError(msg === 'timeout' ? '摄像头未响应（10秒超时）' : '无法访问摄像头（' + msg + '）')
      setCamReady(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamReady(false)
  }, [])

  // ======== 拍摄流程 ========
  const enterShoot = async () => {
    console.log('[enterShoot] template:', template, 'templates.length:', templates.length)
    if (!template) {
      alert('模板尚未加载,请稍后再试')
      return
    }
    setFrameIdx(0)
    setShots([])
    setStage('shoot')
    await startCameraOnly()
  }

  const takeOneShot = useCallback(async () => {
    if (!videoRef.current || busy) return
    setLastCapture(null) // 切回摄像头取景
    setBusy(true)
    for (let c = COUNTDOWN_SECONDS; c > 0; c--) {
      setCountdown(c)
      await sleep(1000)
    }
    setCountdown(null)
    setFlash(true)
    await sleep(120)
    const dataUrl = captureSquareFromVideo(videoRef.current, filter.css, true)
    setFlash(false)
    const shot: Shot = { id: uid(), dataUrl, filterCss: filter.css, stickers: [] }
    setShots((prev) => [...prev, shot])
    setLastCapture(dataUrl) // 定格在刚拍的照片上
    setBusy(false)
    const next = frameIdx + 1
    setFrameIdx(next)
    // 不再自动切回摄像头，等待用户确认拍下一张
  }, [busy, frameIdx, template, filter, stopCamera])

  const retakeFrame = useCallback(() => {
    setShots((s) => s.slice(0, -1))
    setFrameIdx((i) => Math.max(0, i - 1))
    setLastCapture(null)
  }, [])

  // ======== 编辑 + 打印 ========
  const addStickerAt = (cx: number, cy: number) => {
    if (!activeSticker || !editRef.current) return
    const r = editRef.current.getBoundingClientRect()
    const st: PlacedSticker = {
      id: uid(),
      emoji: activeSticker,
      x: Math.max(0, Math.min(1, (cx - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (cy - r.top) / r.height)),
      scale: 1,
    }
    setShots((p) => p.map((s, i) => (i === editSelected ? { ...s, stickers: [...s.stickers, st] } : s)))
  }
  const moveSticker = (cx: number, cy: number) => {
    if (!dragId.current || !editRef.current) return
    const r = editRef.current.getBoundingClientRect()
    setShots((p) =>
      p.map((s, i) =>
        i === editSelected
          ? {
              ...s,
              stickers: s.stickers.map((k) =>
                k.id === dragId.current
                  ? {
                      ...k,
                      x: Math.max(0, Math.min(1, (cx - r.left) / r.width)),
                      y: Math.max(0, Math.min(1, (cy - r.top) / r.height)),
                    }
                  : k,
              ),
            }
          : s,
      ),
    )
  }

  const savePrint = useCallback(async () => {
    if (!template) return
    setBusy(true)
    const canvas = await composeWithTemplate(shots, template)
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    const buf = await blob.arrayBuffer()
    const result = await window.kiosk.saveCapture(buf, {
      filename: `booth_${Date.now()}.png`,
      contentType: 'image/png',
      capturedAt: Date.now(),
    })
    console.log('[savePrint] 保存完成, taskId:', result.taskId, 'clientPhotoId:', result.clientPhotoId)
    setPendingTaskId(result.taskId)
    setQrUrl(null)
    setUploadError(null)
    setBusy(false)
    setStage('result')
  }, [shots, template])

  const startUpload = async () => {
    if (!pendingTaskId) {
      console.warn('[upload] pendingTaskId 为空, 无法上传')
      return
    }
    console.log('[upload] 开始上传, taskId:', pendingTaskId)
    setUploading(true)
    setUploadError(null)
    try {
      const result = await window.kiosk.uploadCapture(pendingTaskId)
      console.log('[upload] 上传结果:', JSON.stringify(result))
      setUploading(false)
      if (result.ok && result.cosKey) {
        const url = CDN_BASE + result.cosKey
        setQrUrl(url)
      } else {
        setUploadError(result.error || '上传失败')
      }
    } catch (e: unknown) {
      console.error('[upload] 上传异常:', e)
      setUploading(false)
      setUploadError((e as Error).message || '未知错误')
    }
  }

  const beginTplDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = tplScrollRef.current
    if (!el) return
    tplDragRef.current.active = true
    tplDragRef.current.startX = e.clientX
    tplDragRef.current.startLeft = el.scrollLeft
    tplDragRef.current.moved = false
    tplDragRef.current.pointerId = e.pointerId
    tplSuppressClickRef.current = false
    el.classList.add('is-dragging')
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Ignore capture failures on unsupported devices.
    }
  }

  const moveTplDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = tplScrollRef.current
    if (!el || !tplDragRef.current.active) return
    const dx = e.clientX - tplDragRef.current.startX
    if (Math.abs(dx) > 6) {
      tplDragRef.current.moved = true
      tplSuppressClickRef.current = true
    }
    el.scrollLeft = tplDragRef.current.startLeft - dx
  }

  const endTplDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tplDragRef.current.active) return
    tplDragRef.current.active = false
    const el = tplScrollRef.current
    if (el) el.classList.remove('is-dragging')
    if (tplDragRef.current.pointerId !== -1) {
      try {
        e.currentTarget.releasePointerCapture(tplDragRef.current.pointerId)
      } catch {
        // Ignore release failures on unsupported devices.
      }
    }
    tplDragRef.current.pointerId = -1
  }

  const suppressTplClickIfDragged = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tplSuppressClickRef.current) return
    e.preventDefault()
    e.stopPropagation()
    tplSuppressClickRef.current = false
  }

  // ======== admin ========
  const cornerTap = () => {
    const now = Date.now()
    taps.current = taps.current.filter((t) => now - t < 3000)
    taps.current.push(now)
    if (taps.current.length >= 5) {
      taps.current = []
      openPin()
    }
  }
  const openPin = () => {
    setPin('')
    setPinErr('')
    setAdmin('pin')
  }
  const pressKey = async (k: string) => {
    if (k === 'del') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (k === 'ok') {
      const ok = await window.kiosk.verifyAdmin(pin)
      if (ok) {
        setAdmin('open')
        setTab('tasks')
        refreshAdmin()
      } else {
        setPinErr(t('admin.pin.error'))
        setPin('')
      }
      return
    }
    setPin((p) => (p.length < 8 ? p + k : p))
  }
  const refreshAdmin = useCallback(() => {
    window.kiosk.listTasks().then(setTasks)
    window.kiosk.systemStatus().then(setSys)
  }, [])
  useEffect(() => {
    if (admin !== 'open') return
    const t = setInterval(refreshAdmin, 2000)
    return () => clearInterval(t)
  }, [admin, refreshAdmin])

  // ======== JSX helpers ========

  const renderWelcome = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        background: 'radial-gradient(1200px 700px at 50% -10%, #1e1b4b, #0b0b12)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
      <div
        style={{
          position: 'absolute',
          inset: -20,
          background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(124,58,237,.15),transparent 70%)',
        }}
      />
      <div style={{ fontSize: 100, animation: 'bob 2.4s ease-in-out infinite', position: 'relative' }}>📸</div>
      <h1
        style={{
          fontSize: 48,
          margin: 0,
          fontWeight: 900,
          background: 'linear-gradient(90deg,#a78bfa,#f472b6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          position: 'relative',
        }}>
        {t('welcome.title')}
      </h1>
      <p style={{ fontSize: 22, opacity: 0.7, margin: 0, position: 'relative' }}>{t('welcome.tap')}</p>
      <div style={{ marginTop: 20, position: 'relative' }}>
        <button className="big-btn" onClick={() => setStage('mode')} style={{ fontSize: 28, padding: '24px 60px' }}>
          ✨ {t('welcome.start')}
        </button>
      </div>
      <style>{`@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}`}</style>
    </div>
  )

  const renderMode = () => {
    if (!templates.length) {
      console.warn('[mode] 模板还在加载中...')
    }
    const available = templatesForShotCount(templates, shotCount)
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 30,
          background: 'radial-gradient(1200px 700px at 50% 30%, #1e1b4b, #0b0b12)',
          color: '#fff',
        }}>
        <h2 style={{ fontSize: 32, margin: 0 }}>{t('mode.title')}</h2>
        <div className="krow" style={{ fontSize: 18 }}>
          {[1, 2, 4].map((n) => (
            <button
              key={n}
              className={`kchip ${shotCount === n ? 'on' : ''}`}
              onClick={() => {
                setShotCount(n)
                const first = templatesForShotCount(templates, n)[0]
                if (first) setTemplate(first)
              }}>
              {t('mode.shotCount', { n })}
            </button>
          ))}
        </div>
        <div
          ref={tplScrollRef}
          className="tpl-scroll"
          onPointerDown={beginTplDrag}
          onPointerMove={moveTplDrag}
          onPointerUp={endTplDrag}
          onPointerCancel={endTplDrag}
          onClickCapture={suppressTplClickIfDragged}>
          {available.map((t) => (
            <div
              key={t.id}
              className={`tpl-card ${template?.id === t.id ? 'on' : ''}`}
              onClick={() => {
                setTemplate(t)
              }}>
              {t.bgUrl ? <img src={t.bgUrl} alt="" /> : <div className="ph" />}
              <div className="label">{t.name}</div>
            </div>
          ))}
        </div>
        <div className="krow">
          <button className="kchip" onClick={() => setStage('welcome')}>
            ← {t('mode.back')}
          </button>
          <button className="big-btn" onClick={enterShoot} style={{ fontSize: 20, padding: '16px 40px' }}>
            {t('mode.start')}
          </button>
        </div>
      </div>
    )
  }

  const renderShoot = () => {
    if (!template) return null
    const done = frameIdx >= template.frames.length
    // 正在回看定格画面时 frame overlay 应对应被显示的照片；全部拍完后固定显示最后一帧
    const reviewing = lastCapture !== null && !done
    const overlayIdx = done ? template.frames.length - 1 : reviewing ? Math.max(0, frameIdx - 1) : frameIdx
    const cf = template.frames[overlayIdx]
    const progressWidth =
      template.frames.length > 1 ? `${done ? 100 : (frameIdx / template.frames.length) * 100}%` : '0%'
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          background: '#0b0b12',
          color: '#fff',
        }}>
        {!done && (
          <div style={{ fontSize: 18, opacity: 0.8 }}>
            {template.name} · {t('shoot.next')} {frameIdx + 1}/{template.frames.length}
          </div>
        )}
        {!done && (
          <div style={{ width: 300, height: 6, background: '#262636', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{ height: '100%', width: progressWidth, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }}
            />
          </div>
        )}
        <div
          style={{
            position: 'relative',
            width: 'min(80vh,900px)',
            aspectRatio: '4/3',
            borderRadius: 24,
            overflow: 'hidden',
            background: '#000',
            boxShadow: '0 20px 60px rgba(124,58,237,.35)',
            filter: filter.css,
          }}>
          {/* video 始终保持在 DOM 中（定格时隐藏），确保 videoRef 不丢失 */}
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              transform: 'scaleX(-1)',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: lastCapture ? 'none' : 'block',
            }}
          />
          {lastCapture && (
            <img
              src={lastCapture}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {/* 模板 frame 拼图覆盖——只显示模板上当前 frame 对应区域 */}
          {template.bgUrl && cf && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 4 }}>
              <img
                src={template.bgUrl}
                alt=""
                style={{
                  position: 'absolute',
                  left: (cf.x > 0 ? -((cf.x * 100) / cf.width) : 0) + '%',
                  top: (cf.y > 0 ? -((cf.y * 100) / cf.height) : 0) + '%',
                  width: (cf.width > 0 ? 100 / cf.width : 100) + '%',
                  height: (cf.height > 0 ? 100 / cf.height : 100) + '%',
                  opacity: 1,
                  imageRendering: 'auto',
                }}
              />
            </div>
          )}
          {!camReady && !camError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                zIndex: 5,
              }}>
              {t('common.loading')}
            </div>
          )}
          {camError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 20,
                textAlign: 'center',
                zIndex: 5,
              }}>
              <div>{camError}</div>
              <button className="kchip" onClick={startCameraOnly}>
                🔄 {t('common.retry')}
              </button>
            </div>
          )}
          {countdown !== null && (
            <div className="kcount" style={{ zIndex: 6 }}>
              {countdown}
            </div>
          )}
          {flash && <div className="kflash" style={{ zIndex: 7 }} />}
        </div>
        {!done && (
          <div className="krow" style={{ marginTop: 8 }}>
            <button
              className="kchip"
              onClick={() => {
                setStage('welcome')
                stopCamera()
              }}>
              ✕ {t('common.cancel')}
            </button>
            {frameIdx > 0 && (
              <button className="kchip" onClick={retakeFrame}>
                ↩ {t('shoot.retake')}
              </button>
            )}
            {frameIdx < template.frames.length - 1 ? (
              <button
                className="big-btn"
                disabled={!camReady || busy}
                onClick={takeOneShot}
                style={{ fontSize: 20, padding: '16px 36px' }}>
                {busy
                  ? `${t('shoot.smile')}…`
                  : countdown !== null
                    ? `倒数 ${countdown}`
                    : `${t('shoot.smile')}(${frameIdx + 1}/${template.frames.length})`}
              </button>
            ) : (
              <button
                className="big-btn"
                disabled={!camReady || busy}
                onClick={takeOneShot}
                style={{ fontSize: 20, padding: '16px 36px', background: 'linear-gradient(90deg,#059669,#10b981)' }}>
                {busy
                  ? `${t('shoot.smile')}…`
                  : countdown !== null
                    ? `倒数 ${countdown}`
                    : `📸 ${t('shoot.smile')}(${frameIdx + 1}/${template.frames.length})`}
              </button>
            )}
          </div>
        )}
        {allDone && !busy && (
          <div className="krow" style={{ marginTop: 4 }}>
            <button
              className="kchip"
              onClick={() => {
                setStage('welcome')
                stopCamera()
              }}>
              ✕ {t('common.cancel')}
            </button>
            <button
              className="kchip"
              onClick={() => {
                setFrameIdx(Math.max(0, template.frames.length - 1))
              }}>
              ↩ {t('shoot.retake')}
            </button>
            <button
              className="big-btn"
              onClick={() => {
                stopCamera()
                setEditSelected(0)
                setStage('edit')
              }}
              style={{ fontSize: 18, padding: '14px 36px', background: 'linear-gradient(90deg,#059669,#10b981)' }}>
              ✨ {t('edit.done')}
            </button>
          </div>
        )}
      </div>
    )
  }

  const currentEdit = shots[editSelected]

  const renderEdit = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        gap: 18,
        padding: 20,
        background: '#0b0b12',
        color: '#fff',
        overflow: 'auto',
        alignItems: 'center',
      }}>
      {/* 左侧——编辑中的图片 */}
      <div
        style={{
          flex: '1 1 60%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
        <div style={{ fontSize: 16, opacity: 0.7 }}>{t('edit.heading')}</div>
        {currentEdit && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 'min(55vh,700px)',
              maxHeight: 'min(80vh,90vw)',
              aspectRatio: template ? `${template.bgW}/${template.bgH}` : '1/1',
              borderRadius: 24,
              overflow: 'hidden',
              background: '#000',
              boxShadow: '0 20px 60px rgba(124,58,237,.35)',
            }}>
            {/* 合成图：模板背景 + 所有照片。异步生成，未就绪时 fallback 展示模板+各张照片 */}
            {composedImage ? (
              <img
                src={composedImage}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <>
                {shots.map((s, i) => {
                  const f = template?.frames[i]
                  if (!f) return null
                  return (
                    <img
                      key={s.id}
                      src={s.dataUrl}
                      alt=""
                      draggable={false}
                      style={{
                        position: 'absolute',
                        left: `${f.x * 100}%`,
                        top: `${f.y * 100}%`,
                        width: `${f.width * 100}%`,
                        height: `${f.height * 100}%`,
                        objectFit: 'cover',
                      }}
                    />
                  )
                })}
                {template && template.bgUrl && (
                  <img
                    src={template.bgUrl}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {composing && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,.4)',
                      zIndex: 5,
                      fontSize: 18,
                      color: '#a78bfa',
                    }}>
                    {t('edit.composing')}
                  </div>
                )}
              </>
            )}
            {/* 贴纸覆盖层(整个画布可点) */}
            <div
              ref={editRef}
              style={{ position: 'absolute', inset: 0 }}
              onClick={(e) => addStickerAt(e.clientX, e.clientY)}
              onPointerMove={(e) => dragId.current && moveSticker(e.clientX, e.clientY)}
              onPointerUp={() => (dragId.current = null)}>
              {currentEdit.stickers.map((s) => (
                <span
                  key={s.id}
                  className="kplaced"
                  style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: 'max(5cqw,28px)' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    dragId.current = s.id
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setShots((p) =>
                      p.map((sh, i) =>
                        i === editSelected ? { ...sh, stickers: sh.stickers.filter((k) => k.id !== s.id) } : sh,
                      ),
                    )
                  }}>
                  {s.emoji}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* 右侧——贴纸 + 相框 + 操作按钮 */}
      <div
        style={{
          flex: '0 0 300px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          overflowY: 'auto',
          maxHeight: '100%',
        }}>
        <div style={{ fontSize: 14, opacity: 0.6, textAlign: 'center' }}>{t('edit.stickerHint')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STICKERS.map((s) => (
            <button
              key={s}
              className={`ksticker ${activeSticker === s ? 'on' : ''}`}
              onClick={() => {
                setActiveSticker(s)
                setShots((p) =>
                  p.map((sh, i) =>
                    i === editSelected
                      ? {
                          ...sh,
                          stickers: [
                            ...sh.stickers,
                            { id: uid(), emoji: s, x: 0.5, y: 0.5 + Math.random() * 0.05, scale: 1 },
                          ],
                        }
                      : sh,
                  ),
                )
              }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 8 }}>
          <button
            className="big-btn"
            disabled={busy}
            onClick={savePrint}
            style={{ fontSize: 16, padding: '14px 24px', width: '100%' }}>
            {busy ? `${t('result.processing')}` : '✨ ' + t('result.print')}
          </button>
        </div>
        <button
          className="kchip"
          onClick={() => {
            stopCamera()
            setStage('welcome')
          }}
          style={{ fontSize: 13, alignSelf: 'center' }}>
          {t('edit.cancelBack')}
        </button>
      </div>
    </div>
  )

  const renderResult = () => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 40,
        background: 'radial-gradient(800px 500px at 50% 40%,#1e1b4b,#0b0b12)',
        color: '#fff',
        textAlign: 'center',
        overflow: 'auto',
      }}>
      <div style={{ fontSize: 60 }}>✅</div>
      <h2 style={{ fontSize: 28, margin: 0 }}>{t('result.title')}</h2>
      <p style={{ fontSize: 16, opacity: 0.7, margin: 0, maxWidth: 360 }}>{t('result.print')}</p>

      {!qrUrl && !uploading && !uploadError && (
        <button className="big-btn" onClick={startUpload} style={{ fontSize: 18, padding: '14px 36px', marginTop: 12 }}>
          📱 {t('result.qr')}
        </button>
      )}

      {uploading && (
        <div style={{ marginTop: 12, opacity: 0.8 }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>{t('result.uploading')}</div>
          <div style={{ width: 200, height: 6, background: '#262636', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg,#7c3aed,#ec4899)',
                animation: 'kprog 2s ease infinite',
              }}
            />
          </div>
        </div>
      )}

      {uploadError && (
        <div style={{ marginTop: 12, color: '#f87171', fontSize: 15 }}>
          {uploadError}
          <br />
          <button className="kchip" onClick={startUpload} style={{ marginTop: 12, color: '#fff' }}>
            🔄 {t('result.uploadError')}
          </button>
        </div>
      )}

      {qrUrl && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <canvas
            ref={(el) => {
              if (el && qrUrl) {
                QRCode.toCanvas(el, qrUrl, { width: 200, margin: 1 }).catch(() => {})
              }
            }}
            style={{ borderRadius: 12, background: '#fff', padding: 8 }}
          />
          <div style={{ fontSize: 13, opacity: 0.6, maxWidth: 300 }}>{t('result.uploaded')}</div>
        </div>
      )}

      <button
        className="kchip"
        onClick={() => {
          setStage('welcome')
          setPendingTaskId(null)
          setQrUrl(null)
          setUploadError(null)
        }}
        style={{ fontSize: 16, marginTop: 24 }}>
        ← {t('result.backHome')}
      </button>
      <style>{`@keyframes kprog{from{width:0}to{width:100%}}`}</style>
    </div>
  )

  // ======== admin panel ========
  const renderAdmin = () => (
    <>
      {admin === 'pin' && (
        <div
          className="admin-mask"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdmin('hidden')
          }}>
          <div className="pinbox">
            <h3>{t('admin.verify')}</h3>
            <div className="sub">{t('admin.pin')}</div>
            <div className="pindots">{'•'.repeat(pin.length) || '·'}</div>
            <div className="pinerr">{pinErr}</div>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                <button key={k} onClick={() => pressKey(k)}>
                  {k}
                </button>
              ))}
              <button onClick={() => pressKey('del')}>⌫</button>
              <button onClick={() => pressKey('0')}>0</button>
              <button onClick={() => pressKey('ok')}>✓</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="pbtn ghost" onClick={() => setAdmin('hidden')}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {admin === 'open' && (
        <div className="admin-mask">
          <div className="panel">
            <div className="panel-head">
              <h2>🛠 {t('admin.title')}</h2>
              <div className="panel-tabs">
                <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>
                  {t('admin.tab.tasks')}
                </button>
                <button className={tab === 'system' ? 'on' : ''} onClick={() => setTab('system')}>
                  {t('admin.tab.system')}
                </button>
                <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>
                  {t('admin.tab.about')}
                </button>
                <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
                  {t('admin.tab.settings')}
                </button>
                <button className={tab === 'printer' ? 'on' : ''} onClick={() => { setTab('printer'); if (!printersLoaded) { window.kiosk.listPrinters().then((p) => { setPrinters(p); setPrintersLoaded(true) }) } }}>
                  {t('admin.tab.printer')}
                </button>
              </div>
              <button className="close" onClick={() => setAdmin('hidden')}>
                ×
              </button>
            </div>
            <div className="panel-body">
              {tab === 'tasks' && (
                <>
                  <div style={{ marginBottom: 12, color: '#9ca3af', fontSize: 13 }}>
                    {t('tasks.count', { n: tasks.length })}
                  </div>
                  {tasks.length === 0 && <div style={{ color: '#6b7280' }}>{t('tasks.empty')}</div>}
                  {tasks.map((task) => {
                    const pct = task.size ? Math.round((task.uploadedBytes / task.size) * 100) : 0
                    return (
                      <div className="tk" key={task.id}>
                        <div className="r">
                          <b>{task.filename}</b>
                          <span className={`pill ${task.status}`}>{task.status}</span>
                        </div>
                        <div className="r" style={{ color: '#9ca3af', marginTop: 4 }}>
                          <span>
                            {(task.size / 1024).toFixed(0)} KB{task.cosKey ? ' · COS' : ''}
                          </span>
                          <span>{task.status === 'completed' ? t('tasks.cleared') : `${pct}%`}</span>
                        </div>
                        {task.error && <div style={{ color: '#fca5a5', marginTop: 4 }}>{task.error}</div>}
                      </div>
                    )
                  })}
                </>
              )}
              {tab === 'system' && sys && (
                <>
                  <div className="stat-grid">
                    <div className="stat">
                      <div className="lbl">{t('system.disk')}</div>
                      <div className="val">{sys.disk ? `${sys.disk.freeGB} / ${sys.disk.totalGB} GB` : 'N/A'}</div>
                      {sys.disk && (
                        <div className={`bar ${sys.disk.usedPct > 85 ? 'warn' : ''}`}>
                          <i style={{ width: `${sys.disk.usedPct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="stat">
                      <div className="lbl">{t('system.memory')}</div>
                      <div className="val">{sys.memory.usedPct}%</div>
                      <div className={`bar ${sys.memory.usedPct > 85 ? 'warn' : ''}`}>
                        <i style={{ width: `${sys.memory.usedPct}%` }} />
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                        {(sys.memory.freeMB / 1024).toFixed(1)} GB {t('system.memory')} / {(sys.memory.totalMB / 1024).toFixed(1)} GB
                      </div>
                    </div>
                    <div className="stat">
                      <div className="lbl">{t('system.cpu')}</div>
                      <div className="val">
                        {t('system.cpuDetail', { cores: sys.cpu.cores, load: sys.cpu.loadAvg1 })}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{sys.cpu.model}</div>
                    </div>
                    <div className="stat">
                      <div className="lbl">{t('system.deviceLabel')}</div>
                      <div className="val">{sys.deviceId}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                        {sys.platform}/{sys.arch} · {t('system.uptime')} {Math.floor(sys.uptimeSec / 60)} min · v{sys.appVersion}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button className="pbtn ghost" onClick={refreshAdmin}>
                      {t('common.retry')}
                    </button>
                  </div>
                </>
              )}
              {tab === 'about' && (
                <>
                  <div className="about-row">
                    <span>{t('about.product')}</span>
                    <b>{t('welcome.title')}</b>
                  </div>
                  <div className="about-row">
                    <span>{t('about.version')}</span>
                    <b>v{version}</b>
                  </div>
                  <div className="about-row">
                    <span>{t('system.deviceId')}</span>
                    <b>{sys?.deviceId || '...'}</b>
                  </div>
                  <div style={{ margin: '18px 0 8px', fontWeight: 700 }}>{t('about.check')}</div>
                  <div style={{ background: '#1a1a26', border: '1px solid #262636', borderRadius: 12, padding: 16 }}>
                    <div style={{ minHeight: 24, color: '#9ca3af' }}>
                      {upd.phase === 'idle' && t('about.idleHint')}
                      {upd.phase === 'checking' && `${t('about.checking')}…`}
                      {upd.phase === 'available' && (
                        <>
                          {t('about.available')} v{upd.version}
                          {upd.totalSize != null && (
                            <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>
                              ({(upd.totalSize / 1024 / 1024).toFixed(0)} MB)
                            </span>
                          )}
                        </>
                      )}
                      {upd.phase === 'none' && `${t('about.none')}(v${upd.version})`}
                      {upd.phase === 'downloading' && (
                        <>
                          {t('about.downloading')} {upd.transferred != null ? (upd.transferred / 1024 / 1024).toFixed(1) : '?'} /{' '}
                          {upd.total != null ? (upd.total / 1024 / 1024).toFixed(1) : '?'} MB
                          {upd.totalSize != null && upd.total != null && upd.total < upd.totalSize
                            ? t('about.downloadDelta', { total: ((upd.totalSize - upd.total) / upd.totalSize * 100).toFixed(0), fullSize: (upd.totalSize / 1024 / 1024).toFixed(0) })
                            : upd.totalSize != null
                              ? t('about.downloadFull', { size: (upd.totalSize / 1024 / 1024).toFixed(0) })
                              : ''}{' '}
                          ({upd.percent}%)
                        </>
                      )}
                      {upd.phase === 'installing' && `v${upd.version} ${t('about.installing')}`}
                      {upd.phase === 'downloaded' && `v${upd.version} ${t('about.installing')}`}
                      {upd.phase === 'error' && `${t('about.error')}: ${upd.msg}`}
                    </div>
                    {upd.diag && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#93c5fd', lineHeight: 1.5 }}>
                        {t('about.diag')}: {upd.diag}
                      </div>
                    )}
                    {upd.phase === 'downloading' && (
                      <div className="bar" style={{ marginTop: 10 }}>
                        <i style={{ width: `${upd.percent}%` }} />
                      </div>
                    )}
                    <div className="krow" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
                      {upd.phase === 'available' && (
                        updateInstallSupported
                          ? (
                            <button className="pbtn ghost" onClick={handleDownload}>
                              {t('about.download')}
                              {upd.totalSize != null ? `（${(upd.totalSize / 1024 / 1024).toFixed(0)} MB）` : ''}
                            </button>
                            )
                          : null
                      )}
                      {upd.phase === 'downloaded' && (
                        <button className="pbtn" onClick={handleInstall}>
                          {t('about.restart')}
                        </button>
                      )}
                      {!updateInstallSupported && (
                        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 0, lineHeight: 1.5 }}>
                          {t('about.installUnsupported')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ fontWeight: 700 }}>{t('about.autoUpdate')}</div>
                      <label
                        className="toggle-switch"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 0, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={appSettings.autoUpdateEnabled}
                          onChange={(e) => {
                            const s = { ...appSettings, autoUpdateEnabled: e.target.checked }
                            setAppSettings(s)
                            window.kiosk.setSettings(s)
                          }}
                          style={{ display: 'none' }}
                        />
                        <span
                          style={{
                            position: 'relative',
                            display: 'inline-block',
                            width: 44,
                            height: 24,
                            background: appSettings.autoUpdateEnabled ? '#7c3aed' : '#334155',
                            borderRadius: 12,
                            transition: 'background .2s',
                          }}>
                          <span
                            style={{
                              position: 'absolute',
                              top: 2,
                              left: appSettings.autoUpdateEnabled ? 22 : 2,
                              width: 20,
                              height: 20,
                              background: '#fff',
                              borderRadius: '50%',
                              transition: 'left .2s',
                            }}
                          />
                        </span>
                      </label>
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 14 }}>
                      {t('about.autoUpdate.desc')}
                    </div>
                  </div>

                  <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                    <button className="pbtn ghost" onClick={() => window.kiosk.quit()}>
                      {t('about.quit')}
                    </button>
                  </div>
                </>
              )}
              {tab === 'settings' && (
                <div style={{ maxWidth: 400 }}>
                  <div style={{ fontWeight: 700, marginBottom: 14 }}>{t('settings.title')}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
                    {t('settings.desc')}{' '}
                    <code style={{ color: '#a78bfa' }}>{t('settings.path')}</code>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {([7, 14, 30] as const).map((d) => (
                      <button
                        key={d}
                        className={`pbtn ${appSettings.retentionDays === d ? '' : 'ghost'}`}
                        onClick={() => {
                          const s = { ...appSettings, retentionDays: d }
                          setAppSettings(s)
                          window.kiosk.setSettings(s)
                        }}>
                        {d === 30 ? t('settings.days.30') : (d === 7 ? t('settings.days.7') : t('settings.days.14'))}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tab === 'printer' && (
                <div style={{ maxWidth: 460 }}>
                  <div style={{ fontWeight: 700, marginBottom: 14 }}>{t('printer.title')}</div>
                  {printers.length === 0 && (
                    <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>{t('printer.empty')}</div>
                  )}
                  {printers.map((p, i) => {
                    const ds = p.detailedStatus
                    const isUnavailable = ds === 'unavailable' || (ds == null && p.status === 2)
                    const isActive = ds === 'active' || (ds == null && p.status === 1)
                    const statusLabel = isUnavailable ? t('printer.status.unavailable')
                      : isActive ? t('printer.status.active')
                      : t('printer.status.idle')
                    const statusColor = isUnavailable ? '#f87171' : isActive ? '#fbbf24' : '#4ade80'
                    const isSelected = appSettings.printerName ? p.name === appSettings.printerName : p.isDefault
                    const hasSupplies = p.supplies && p.supplies.inkLevels.length > 0
                    return (
                      <div key={i} style={{
                        background: isSelected ? 'rgba(167,139,250,.12)' : 'rgba(255,255,255,.06)',
                        border: isSelected ? '1px solid rgba(167,139,250,.3)' : '1px solid transparent',
                        borderRadius: 8,
                        padding: '14px 16px',
                        marginBottom: 8,
                        cursor: 'pointer',
                      }} onClick={() => {
                        if (isSelected) return
                        const s = { ...appSettings, printerName: p.name }
                        setAppSettings(s)
                        window.kiosk.setSettings(s)
                        window.kiosk.selectPrinter(p.name)
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <span style={{ fontSize: 24, lineHeight: 1 }}>🖨️</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {p.displayName || p.name}
                              {isSelected && <span style={{ marginLeft: 8, fontSize: 11, color: '#a78bfa' }}>✓ {t('printer.selected')}</span>}
                              {!isSelected && p.isDefault && <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>[{t('printer.default')}]</span>}
                            </div>
                            <div style={{ fontSize: 12, color: statusColor, marginBottom: hasSupplies ? 8 : 0 }}>
                              {statusLabel}
                            </div>
                            {hasSupplies && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                {p.supplies!.inkLevels.map((ink, j) => (
                                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <span style={{ width: 36 }}>{ink.name}</span>
                                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.1)', borderRadius: 3, overflow: 'hidden' }}>
                                      <div style={{ width: `${ink.pct}%`, height: '100%', background: ink.pct > 20 ? '#4ade80' : '#f87171', borderRadius: 3, transition: 'width .3s' }} />
                                    </div>
                                    <span style={{ width: 32, textAlign: 'right' }}>{ink.pct}%</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button className="pbtn" onClick={() => window.kiosk.testPrint()}>
                      🖨️ {t('printer.testPrint')}
                    </button>
                    <button className="pbtn ghost" onClick={() => { setPrintersLoaded(false); window.kiosk.listPrinters().then((p) => { setPrinters(p); setPrintersLoaded(true) }) }}>
                      🔄 {t('printer.refresh')}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
                    {t('printer.hint')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="kiosk" onPointerDown={() => window.kiosk.reportActivity()}>
      <div className="corner-hot" onClick={cornerTap} />
      {toast && <div className="ktoast">{toast}</div>}
      {lock && (
        <div className="klock">
          <div className="ic">🔒</div>
          <h2>{t('lock.title')}</h2>
          <p style={{ opacity: 0.6 }}>
            {t('lock.desc', { id: lock.commandId.slice(0, 8), from: lock.issuedBy || 'admin' })}
          </p>
        </div>
      )}
      <div className="kbar">
        <h1>📸 {t('welcome.title')}</h1>
      </div>

      {stage === 'welcome' && renderWelcome()}
      {stage === 'mode' && renderMode()}
      {stage === 'shoot' && renderShoot()}
      {stage === 'edit' && renderEdit()}
      {stage === 'result' && renderResult()}
      {renderAdmin()}

      {/* Language switcher / 语言切换 */}
      <div style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        gap: 6,
        zIndex: 100,
      }}>
        <button
          className={`kchip ${appSettings.language === 'zh' ? 'on' : ''}`}
          onClick={() => {
            const s = { ...appSettings, language: 'zh' as const }
            setAppSettings(s)
            window.kiosk.setSettings(s)
          }}
          style={{ fontSize: 18, padding: '4px 8px', opacity: 0.7 }}
          title="中文">
          🇨🇳
        </button>
        <button
          className={`kchip ${appSettings.language === 'en' ? 'on' : ''}`}
          onClick={() => {
            const s = { ...appSettings, language: 'en' as const }
            setAppSettings(s)
            window.kiosk.setSettings(s)
          }}
          style={{ fontSize: 18, padding: '4px 8px', opacity: 0.7 }}
          title="English">
          🇺🇸
        </button>
      </div>
    </div>
  )
}
