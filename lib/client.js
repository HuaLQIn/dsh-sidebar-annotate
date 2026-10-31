// dsh-sidebar-annotate 的浏览器端 bundle（手写 CJS + ModuleLoader 包装，零构建步骤）。
//
// 设计参照物：Codex（ChatGPT 桌面版）自带的批注，内部代号 popcorn。
// 从 `C:\Program Files\WindowsApps\OpenAI.Codex_*\app\resources\app.asar` 里读出的设计事实：
//   · 进入批注模式 → 光标换成蓝色自定义光标（SVG，热点 13,12，回退 crosshair）
//   · 悬停目标 → 2px 蓝色虚线框 + 10% 蓝色淡填（accent = #339CFF / --color-text-info）
//   · 点一下 → 落一个「编号标记」：蓝底(#339cff) 白 1px 环、圆形但左下角 3px 方角，白字编号
//   · 标记旁弹评论卡写一句话；一批可标多处，最后一起发
// 本插件把这套搬到 DSH 右侧栏的图片预览上：图不动、就地标记、图下方一条 pill 收口。
//
// 只挂官方公开插槽：sidebar.right.tab.document.actions（文件预览头部按钮位）。
// 图片本身仍由官方渲染器画（缩放、滚动、样式一律不动），本插件只量它的屏幕矩形，
// 在同一位置铺一层透明画布 + 若干标记 DOM。
// 回传会话走官方提交链路：conversation.createDrafts → input.for(scoped).addAttachments/setDraft/submit。

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-annotate',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement

    // ============================== 设计令牌（照抄 Codex） ==============================
    var ACCENT = '#339cff'          // --color-text-info / --color-background-info-solid
    var ACCENT_SOFT = 'rgba(51,156,255,0.10)'
    var ACCENT_BORDER = 'rgba(51,156,255,0.42)'
    var MARKER_EDGE = 'rgba(255,255,255,0.95)'
    var PEN_COLORS = ['#ff3b30', '#ffcc00', '#339cff', '#34c759']
    var PEN_WEIGHTS = [2, 4, 7]     // 细 / 中 / 粗（屏幕 CSS 像素，导出时按原图比例放大）
    // 绘制工具有五种，加「标记」共六格。键位取首字母，写说明时不生效（见 onKey）。
    var TOOL_ORDER = ['mark', 'pen', 'arrow', 'rect', 'square', 'triangle']
    var TOOL_KEYS = { mark: 'v', pen: 'p', arrow: 'a', rect: 'r', square: 's', triangle: 't' }
    // 拖动两点就能成形的那几种（画笔是逐点累积，不在此列）
    var SHAPE_TOOLS = { arrow: 1, rect: 1, square: 1, triangle: 1 }

    // Codex 的批注光标：26×26 的箭头轮廓，热点 13,12
    var CURSOR_PATH = 'M13 1.6c.6 0 1.1.3 1.5.8l9.6 15.2c.5.8.1 1.9-.9 2l-5.6.7 3 5.2c.4.7.2 1.6-.5 2l-2.2 1.2c-.7.4-1.6.2-2-.5l-3-5.2-4 3.9c-.7.7-1.9.3-2-.7L4.3 4.6c-.1-1 .6-1.9 1.6-2z'
    var CURSOR_URL = 'url("data:image/svg+xml,' + encodeURIComponent(
      '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="' + CURSOR_PATH + '" fill="' + ACCENT + '" stroke="white" stroke-width="1.167"/></svg>') + '") 13 12, crosshair'

    // ============================== 文案 ==============================
    // 语言只认 DSH 自己的 locale 服务（html lang 恒为 "en"，按它判断会把中文界面判成英文）。
    // 取不到就按中文走。
    var EN_T = {
          action: 'Annotate', actionOn: 'Annotating',
          actionTitle: 'Mark spots on this image and send the notes to the conversation',
          tool_mark: 'Mark', tool_pen: 'Pen', tool_arrow: 'Arrow', tool_rect: 'Rectangle',
          tool_square: 'Square', tool_triangle: 'Triangle',
          width: 'Width', widthThin: 'Thin', widthMid: 'Medium', widthThick: 'Thick',
          hintMark: 'Click the image to drop a numbered note',
          hintPen: 'Drag to draw',
          hintArrow: 'Drag to draw an arrow',
          hintRect: 'Drag to pull a rectangle',
          hintSquare: 'Drag to pull a square (sides stay equal)',
          hintTriangle: 'Drag to pull a triangle',
          hintKeys: 'V mark · P pen · A arrow · R rect · S square · T triangle · [ ] width · Ctrl+Z undo · Ctrl+Shift+Z redo · Esc close',
          placeholder: 'One line about this spot',
          save: 'Save', remove: 'Remove', cancel: 'Cancel', send: 'Send', sending: 'Sending…',
          marked: '{n} marked', empty: 'Mark at least one spot', noSession: 'No session is bound to this tab',
          noImage: 'Image area not found', failed: 'Send failed: {message}',
          undo: 'Undo', redo: 'Redo', clear: 'Clear', moreColor: 'Custom color',
          noteHeader: 'I marked spots on this image:',
          noteTail: 'The numbers in the image match the list above.',
          fallbackNote: 'Please look at the numbered marks on this image.',
    }
    var ZH = {
          action: '批注', actionOn: '批注中',
          actionTitle: '在这张图上标几处，并把说明发回对话',
          tool_mark: '标记', tool_pen: '画笔', tool_arrow: '箭头', tool_rect: '长方形',
          tool_square: '正方形', tool_triangle: '三角形',
          width: '粗细', widthThin: '细', widthMid: '中', widthThick: '粗',
          hintMark: '在图上点一下落一个编号，旁边写一句',
          hintPen: '按住拖动即可圈画',
          hintArrow: '按住拖动画一支箭头',
          hintRect: '按住拖动拉出长方形',
          hintSquare: '按住拖动拉出正方形（自动锁等边）',
          hintTriangle: '按住拖动拉出三角形',
          hintKeys: 'V 标记 · P 画笔 · A 箭头 · R 长方形 · S 正方形 · T 三角形 · [ ] 粗细 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · Esc 关闭',
          placeholder: '这一处是什么问题/要改什么',
          save: '保存', remove: '删除', cancel: '取消', send: '发送', sending: '发送中…',
          marked: '已标 {n} 处', empty: '先标一处再发送', noSession: '这个 tab 没有绑定会话',
          noImage: '没找到图片区域', failed: '发送失败：{message}',
          undo: '撤销', redo: '重做', clear: '清空', moreColor: '自定义颜色',
          noteHeader: '我在这张图上标了几处：',
          noteTail: '图上的数字和上面编号一一对应。',
          fallbackNote: '请看这张图上标了编号的位置。',
        }

    var hostCtx = null
    function isEnglish() {
      try {
        var locale = hostCtx === null ? undefined : hostCtx.get('locale')
        var snap = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : undefined
        var active = snap && snap.active
        return typeof active === 'string' && /^en/i.test(active)
      } catch (_) {
        return false
      }
    }
    function t() { return isEnglish() ? EN_T : ZH }

    // ============================== 样式 ==============================
    var STYLE_ID = 'dsh-sidebar-annotate-style'
    if (document.getElementById(STYLE_ID) === null) {
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = [
        '.dsa-btn { display: inline-flex; align-items: center; gap: 5px; height: 26px;',
        '  padding: 0 9px; margin: 0 2px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));',
        '  border-radius: 13px; background: transparent; cursor: pointer;',
        '  color: var(--dsw-alias-label-secondary, #8a8a8e);',
        '  font-family: var(--dsw-font-family, system-ui); font-size: 12px; line-height: 18px; }',
        '.dsa-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));',
        '  color: var(--dsw-alias-label-primary, #eee); }',
        '.dsa-btn[data-on="1"] { background: ' + ACCENT + '; border-color: transparent; color: #fff; }',
        '.dsa-btn svg { width: 14px; height: 14px; }',
        // 画布：铺在图片矩形上；批注模式用 Codex 那支蓝光标
        '.dsa-ink { position: fixed; z-index: 1200; touch-action: none; }',
        '.dsa-ink[data-mode="mark"] { cursor: ' + CURSOR_URL + '; }',
        '.dsa-ink[data-mode="draw"] { cursor: crosshair; }',
        // 编号标记：蓝底、白 1px 环、左下角 3px 方角（照 popcorn 的 borderRadius 50/50/50/3）
        '.dsa-mark { position: fixed; z-index: 1202; display: grid; place-items: center;',
        '  width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50% 50% 50% 3px;',
        '  background: ' + ACCENT + '; color: #fff; cursor: pointer;',
        '  box-shadow: 0 0 0 1px ' + MARKER_EDGE + ', 0 2px 6px rgba(0,0,0,.35);',
        '  font-family: var(--dsw-font-family, system-ui); font-size: 11px; font-weight: 700;',
        '  line-height: 1; user-select: none; }',
        '.dsa-mark[data-active="1"] { box-shadow: 0 0 0 1px #fff, 0 0 0 4px ' + ACCENT_BORDER + '; }',
        // 评论卡
        '.dsa-card { position: fixed; z-index: 1203; width: 268px; padding: 8px; border-radius: 12px;',
        '  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16));',
        '  background: var(--dsw-alias-bg-layer-2, #2c2c2e);',
        '  box-shadow: 0 10px 30px rgba(0,0,0,.45);',
        '  font-family: var(--dsw-font-family, system-ui); }',
        '.dsa-card textarea { width: 100%; min-height: 52px; padding: 6px 8px; resize: vertical;',
        '  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3)); border-radius: 8px;',
        '  background: var(--dsw-alias-bg-layer-1, #1c1c1e); color: var(--dsw-alias-label-primary, #eee);',
        '  font-family: inherit; font-size: 12px; line-height: 18px; outline: none; }',
        '.dsa-card textarea:focus { border-color: ' + ACCENT + '; }',
        '.dsa-card textarea::placeholder { color: var(--dsw-alias-label-dimmed, #6d6d72); }',
        '.dsa-cardrow { display: flex; align-items: center; gap: 6px; margin-top: 6px; }',
        '.dsa-spacer { flex: 1; }',
        '.dsa-mini { height: 24px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));',
        '  border-radius: 12px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary, #8a8a8e);',
        '  font-family: inherit; font-size: 12px; }',
        '.dsa-mini:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));',
        '  color: var(--dsw-alias-label-primary, #eee); }',
        '.dsa-mini:disabled { opacity: .4; cursor: default; }',
        '.dsa-primary { height: 24px; padding: 0 12px; border: none; border-radius: 12px; cursor: pointer;',
        '  background: ' + ACCENT + '; color: #fff; font-family: inherit; font-size: 12px; font-weight: 600; }',
        '.dsa-primary:disabled { opacity: .45; cursor: default; }',
        // 收口 pill：照 Codex 的 image-edit-toolbar —— 胶囊 + 半透明毛玻璃 + 细 ring + 投影
        '.dsa-pill { position: fixed; z-index: 1203; display: flex; align-items: center; flex-wrap: wrap; gap: 2px;',
        '  padding: 3px; border-radius: 999px;',
        '  background: var(--dsw-alias-bg-layer-2, #2c2c2e);',
        '  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #2c2c2e) 92%, transparent);',
        '  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);',
        '  box-shadow: 0 0 0 1px var(--dsw-alias-border-subtle, rgba(127,127,127,.28)), 0 6px 18px rgba(0,0,0,.38);',
        '  font-family: var(--dsw-font-family, system-ui); font-size: 12px;',
        '  color: var(--dsw-alias-label-secondary, #8a8a8e); }',
        // 工具格：图标按钮，选中态用蓝色淡底 + 蓝字，和 Codex 的选中样式一致
        '.dsa-tool { display: grid; place-items: center; width: 24px; height: 24px; padding: 0;',
        '  border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer;',
        '  color: var(--dsw-alias-label-secondary, #8a8a8e); }',
        '.dsa-tool:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));',
        '  color: var(--dsw-alias-label-primary, #eee); }',
        '.dsa-tool[data-active="1"] { background: ' + ACCENT_SOFT + '; border-color: ' + ACCENT_BORDER + '; color: ' + ACCENT + '; }',
        '.dsa-tool svg { width: 15px; height: 15px; display: block; }',
        // 粗细：三个预设点 + 一条连续滑块（Codex 是滑块 + 尺寸菜单，这里两样都给）
        '.dsa-wbtn { display: grid; place-items: center; width: 20px; height: 24px; padding: 0;',
        '  border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer; }',
        '.dsa-wbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }',
        '.dsa-wbtn[data-active="1"] { background: ' + ACCENT_SOFT + '; border-color: ' + ACCENT_BORDER + '; }',
        '.dsa-wbtn i { display: block; border-radius: 50%; }',
        '.dsa-range { -webkit-appearance: none; appearance: none; width: 54px; height: 22px; margin: 0 3px;',
        '  background: transparent; cursor: ew-resize; }',
        '.dsa-range::-webkit-slider-runnable-track { height: 3px; border-radius: 2px;',
        '  background: var(--dsw-alias-border-l2, rgba(127,127,127,.45)); }',
        '.dsa-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px;',
        '  margin-top: -4.5px; border-radius: 50%; background: ' + ACCENT + ';',
        '  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2, #2c2c2e); }',
        // 键位提示：绝对定位挂在胶囊下方一行（不参与 flex，胶囊本体保持 Codex 那种单行形状）
        '.dsa-hint { position: absolute; left: 6px; top: 100%; margin-top: 4px; font-size: 11px; line-height: 15px;',
        '  font-family: var(--dsw-font-family, system-ui); color: var(--dsw-alias-label-dimmed, #6d6d72);',
        '  white-space: normal; pointer-events: none; max-width: 92vw; }',
        '.dsa-swatch { width: 18px; height: 18px; padding: 0; border-radius: 50%; cursor: pointer;',
        '  border: 2px solid transparent; }',
        '.dsa-swatch[data-active="1"] { border-color: var(--dsw-alias-label-primary, #eee); }',
        // 自定义颜色：一个圆形取色块，点开是系统调色板
        '.dsa-custom { position: relative; width: 18px; height: 18px; margin: 0 1px; border-radius: 50%;',
        '  overflow: hidden; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }',
        '.dsa-custom input { position: absolute; left: -6px; top: -6px; width: 30px; height: 30px;',
        '  padding: 0; border: none; background: none; cursor: pointer; }',
        // 多行时胶囊会自动折行，圆角保持胶囊感
        '.dsa-sep { width: 1px; height: 16px; margin: 0 2px; background: var(--dsw-alias-border-l2, rgba(127,127,127,.3)); }',
        '.dsa-msg { position: fixed; z-index: 1204; font-family: var(--dsw-font-family, system-ui);',
        '  font-size: 12px; padding: 4px 8px; border-radius: 8px; background: rgba(0,0,0,.72); color: #fff; }',
      ].join('\n')
      document.head.appendChild(style)
    }

    // ============================== 小工具 ==============================
    var IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|ico)$/i
    function isImagePath(path) { return typeof path === 'string' && IMAGE_RE.test(path.split(/[?#]/)[0]) }
    function baseNameOf(path) {
      var trimmed = String(path).replace(/[/\\]+$/, '')
      var cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1
      return trimmed.slice(cut) || trimmed
    }
    function fileMediaUrl(absolutePath) {
      try { return new URL('api/file?path=' + encodeURIComponent(absolutePath), document.baseURI).href } catch (_) { return undefined }
    }
    function fmt(tpl, vars) {
      return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] !== undefined ? String(vars[k]) : '{' + k + '}' })
    }
    function iconPen() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M12 20h9' }), h('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }))
    }
    /** 工具格图标：六种各一支线稿，粗细统一 2，和头部那支笔一个调子。 */
    function toolIcon(tool) {
      var box = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
      if (tool === 'mark') {
        return h('svg', box, h('circle', { cx: 12, cy: 12, r: 7.5 }),
          h('circle', { cx: 12, cy: 12, r: 2, fill: 'currentColor', stroke: 'none' }))
      }
      if (tool === 'arrow') {
        return h('svg', box, h('path', { d: 'M6 18 17.5 6.5' }),
          h('path', { d: 'M17.5 6.5h-6' }), h('path', { d: 'M17.5 6.5v6' }))
      }
      if (tool === 'rect') return h('svg', box, h('rect', { x: 3.5, y: 6.5, width: 17, height: 11, rx: 1.5 }))
      if (tool === 'square') return h('svg', box, h('rect', { x: 5, y: 5, width: 14, height: 14, rx: 1.5 }))
      if (tool === 'triangle') return h('svg', box, h('path', { d: 'M12 4.5 20.5 19.5H3.5Z' }))
      return iconPen()
    }

    /** 找右侧栏正在预览的那张图（只读）。先认官方预览器的 data-image-preview 标记，退路取面积最大的 img。 */
    function findPreviewImage() {
      var marked = document.querySelectorAll('[data-image-preview] img')
      for (var i = 0; i < marked.length; i += 1) {
        var r = marked[i].getBoundingClientRect()
        if (r.width > 4 && r.height > 4 && marked[i].naturalWidth > 0) return marked[i]
      }
      var collapse = null
      var buttons = document.querySelectorAll('button[aria-label]')
      for (var j = 0; j < buttons.length; j += 1) {
        var label = buttons[j].getAttribute('aria-label')
        if (label === '收起右侧边栏' || label === 'Collapse right sidebar') { collapse = buttons[j]; break }
      }
      if (collapse === null) return undefined
      var root = collapse
      for (var k = 0; k < 8 && root.parentElement !== null; k += 1) root = root.parentElement
      var best, bestArea = 0
      var all = root.querySelectorAll('img')
      for (var m = 0; m < all.length; m += 1) {
        var r2 = all[m].getBoundingClientRect()
        var area = r2.width * r2.height
        if (area > bestArea && all[m].naturalWidth > 0 && r2.width > 4 && r2.height > 4) { best = all[m]; bestArea = area }
      }
      return best
    }

    // ============================== 发回会话 ==============================
    async function sendAnnotation(ctx, sessionId, file, caption) {
      var T = t()
      var sessions = ctx.get('sessions')
      var conversation = ctx.get('conversation')
      if (sessions === undefined || conversation === undefined) throw new Error('sessions / conversation service unavailable')
      var scoped = sessions.scope(sessionId)
      if (scoped === undefined || scoped === null) throw new Error('session scope unavailable: ' + sessionId)
      var text = caption && caption.trim() !== '' ? caption.trim() : T.fallbackNote

      // 服务一律从根 ctx 取：Session 作用域 ctx 没有 inject 声明，scoped.conversation 会被守卫拒。
      var drafts = conversation.createDrafts(sessionId, [file])
      var ids = drafts.map(function (d) { return d.id })
      var shell = conversation.input.for(scoped)
      var before = (shell.state.getSnapshot() || {}).draft || ''
      if (shell.addAttachments(ids) === false) throw new Error('composer is locked by an in-flight submission')
      shell.setDraft(before.trim() === '' ? text : before.replace(/\s+$/, '') + '\n\n' + text)
      shell.submit('queue')
      return { mode: 'composer' }
    }

    // ============================== 绘制 ==============================
    /** 画笔笔迹：坐标归一化（0..1），这里乘上画布尺寸再画，屏幕与原图两个尺寸都能复用。 */
    function paintStroke(c2d, stroke, width, height, dpr) {
      var w = Math.max(1, stroke.w * dpr)
      var pts = stroke.pts
      var to = function (p) { return [p[0] * width, p[1] * height] }
      c2d.save()
      c2d.strokeStyle = stroke.color
      c2d.fillStyle = stroke.color
      c2d.lineWidth = w
      c2d.lineCap = 'round'
      c2d.lineJoin = 'round'
      if (stroke.kind === 'arrow') {
        var a = to(pts[0])
        var b = to(pts[pts.length - 1])
        c2d.beginPath(); c2d.moveTo(a[0], a[1]); c2d.lineTo(b[0], b[1]); c2d.stroke()
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0])
        var head = Math.max(8 * dpr, w * 4)
        c2d.beginPath()
        c2d.moveTo(b[0], b[1]); c2d.lineTo(b[0] - head * Math.cos(ang - Math.PI / 7), b[1] - head * Math.sin(ang - Math.PI / 7))
        c2d.moveTo(b[0], b[1]); c2d.lineTo(b[0] - head * Math.cos(ang + Math.PI / 7), b[1] - head * Math.sin(ang + Math.PI / 7))
        c2d.stroke()
      } else if (stroke.kind === 'rect' || stroke.kind === 'box' || stroke.kind === 'square' || stroke.kind === 'triangle') {
        // 三种形状都是从「起画那个角」拉到「松手那个角」（0.6.1 试过改成按下点当中心，用户上手后
        // 说边角起画更好用，0.6.2 已回滚）。正方形在像素空间锁等边：预览画布与导出的大画布
        // 尺寸不同，各自按像素锁，导出来还是方的。
        var p1 = to(pts[0]); var p2 = to(pts[pts.length - 1])
        var x1 = Math.min(p1[0], p2[0]); var y1 = Math.min(p1[1], p2[1])
        var x2 = Math.max(p1[0], p2[0]); var y2 = Math.max(p1[1], p2[1])
        if (stroke.kind === 'square') {
          var side = Math.max(x2 - x1, y2 - y1)
          x1 = p2[0] >= p1[0] ? p1[0] : p1[0] - side
          y1 = p2[1] >= p1[1] ? p1[1] : p1[1] - side
          x2 = x1 + side; y2 = y1 + side
        }
        c2d.beginPath()
        if (stroke.kind === 'triangle') {
          c2d.moveTo((x1 + x2) / 2, y1); c2d.lineTo(x2, y2); c2d.lineTo(x1, y2); c2d.closePath()
          c2d.stroke()
        } else {
          c2d.strokeRect(x1, y1, x2 - x1, y2 - y1)
        }
      } else {
        var first = to(pts[0])
        if (pts.length === 1) {
          c2d.beginPath(); c2d.arc(first[0], first[1], Math.max(w / 2, 0.5), 0, Math.PI * 2); c2d.fill()
        } else {
          c2d.beginPath(); c2d.moveTo(first[0], first[1])
          for (var i = 1; i < pts.length; i += 1) { var q = to(pts[i]); c2d.lineTo(q[0], q[1]) }
          c2d.stroke()
        }
      }
      c2d.restore()
    }

    /** 编号标记画进画布（导出用；屏幕上的标记是 DOM，清晰可点）。 */
    function paintMarker(c2d, marker, index, width, height) {
      var r = Math.max(11, width / 60)
      // 贴边落点也要整个圆都在图里，否则标记会被裁掉一半
      var x = Math.min(width - r - 1, Math.max(r + 1, marker.nx * width))
      var y = Math.min(height - r - 1, Math.max(r + 1, marker.ny * height))
      c2d.save()
      c2d.beginPath()
      c2d.arc(x, y, r, 0, Math.PI * 2)
      c2d.fillStyle = ACCENT
      c2d.fill()
      c2d.lineWidth = Math.max(1, r / 11)
      c2d.strokeStyle = 'rgba(255,255,255,0.95)'
      c2d.stroke()
      c2d.fillStyle = '#fff'
      c2d.font = '700 ' + Math.round(r * 1.15) + 'px system-ui, sans-serif'
      c2d.textAlign = 'center'
      c2d.textBaseline = 'middle'
      c2d.fillText(String(index + 1), x, y + r * 0.04)
      c2d.restore()
    }

    // ============================== 批注层 ==============================
    function AnnotateLayer(props) {
      var T = t()
      var absolutePath = props.absolutePath
      var ctx = props.ctx
      var sessionId = props.sessionId
      var onDone = props.onDone

      var canvasRef = React.useRef(null)
      var imgRef = React.useRef(null)
      var liveRef = React.useRef(null)
      var rectRef = React.useRef(null)

      var rectState = React.useState(null); var rect = rectState[0]; var setRect = rectState[1]
      var markersState = React.useState([]); var markers = markersState[0]; var setMarkers = markersState[1]
      var editingState = React.useState(null); var editing = editingState[0]; var setEditing = editingState[1]
      var strokesState = React.useState([]); var strokes = strokesState[0]; var setStrokes = strokesState[1]
      var modeState = React.useState('mark'); var mode = modeState[0]; var setMode = modeState[1]
      var colorState = React.useState(PEN_COLORS[0]); var color = colorState[0]; var setColor = colorState[1]
      var weightState = React.useState(PEN_WEIGHTS[1]); var weight = weightState[0]; var setWeight = weightState[1]
      // 重做栈：撤销时把被撤掉的那一条压进来，做新动作时清空（和常见编辑器一个规矩）
      var redoState = React.useState([]); var redoStack = redoState[0]; var setRedoStack = redoState[1]
      var redoStackRef = React.useRef([]); redoStackRef.current = redoStack
      // 绘制函数要读最新的笔迹 / 工具 / 悬停，但不想每一步都被 React 重渲染牵着走，
      // 所以把这几样镜像进 ref：拖动时直接命令式重画，零额外渲染。
      var strokesRef = React.useRef([]); strokesRef.current = strokes
      var markersRef = React.useRef([]); markersRef.current = markers
      var modeRef = React.useRef('mark'); modeRef.current = mode
      var hoveringRef = React.useRef(false); hoveringRef.current = hovering
      var weightRef = React.useRef(weight); weightRef.current = weight
      var seqRef = React.useRef(0)
      var nextSeq = function () { seqRef.current += 1; return seqRef.current }
      var stepWeight = function (dir) {
        var i = PEN_WEIGHTS.indexOf(weightRef.current)
        if (i < 0) i = 1
        setWeight(PEN_WEIGHTS[Math.min(PEN_WEIGHTS.length - 1, Math.max(0, i + dir))])
      }
      var hoverState = React.useState(false); var hovering = hoverState[0]; var setHovering = hoverState[1]
      var busyState = React.useState(false); var busy = busyState[0]; var setBusy = busyState[1]
      var errState = React.useState(''); var err = errState[0]; var setErr = errState[1]
      var missingState = React.useState(false); var missing = missingState[0]; var setMissing = missingState[1]
      var visibleState = React.useState(true); var visible = visibleState[0]; var setVisible = visibleState[1]

      // 跟住图片矩形：首帧立即算 + 滚动/改尺寸各一次 + 400ms 兜底（不用 rAF，页面不可见时不派帧）
      React.useEffect(function () {
        var cancelled = false
        var misses = 0
        var lastSrc = null
        var sync = function () {
          if (cancelled) return
          var img = findPreviewImage()
          if (img === undefined) {
            // 图没了（关 tab / 切到非图片 / 收起侧栏）：连续 3 次（约 1.2 秒）就自己收工，
            // 不把一个「没找到图片区域」的空壳留在屏幕上。
            misses += 1
            if (misses >= 3) onDone()
            setMissing(misses < 3)
            return
          }
          misses = 0
          imgRef.current = img
          setMissing(false)
          // 同一个 tab 换了文件：旧图的标记和笔迹必须清掉，否则会画到新图上
          var src = img.currentSrc || img.src
          if (lastSrc !== null && src !== lastSrc) {
            setMarkers([])
            setStrokes([])
            setEditing(null)
            rectRef.current = null
          }
          lastSrc = src
          var r = img.getBoundingClientRect()
          var offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth
          setVisible(!offscreen)
          var prev = rectRef.current
          if (prev === null || Math.abs(prev.x - r.x) > 0.5 || Math.abs(prev.y - r.y) > 0.5 ||
              Math.abs(prev.w - r.width) > 0.5 || Math.abs(prev.h - r.height) > 0.5) {
            rectRef.current = { x: r.x, y: r.y, w: r.width, h: r.height }
            setRect({ x: r.x, y: r.y, w: r.width, h: r.height })
          }
        }
        sync()
        var timer = window.setInterval(sync, 400)
        window.addEventListener('resize', sync)
        document.addEventListener('scroll', sync, true)
        return function () {
          cancelled = true
          window.clearInterval(timer)
          window.removeEventListener('resize', sync)
          document.removeEventListener('scroll', sync, true)
        }
      }, [onDone])

      // 重画：悬停虚线框 + 已提交笔迹 + 正在拖的那一笔。
      // 抽成普通函数而不是只塞在 effect 里：拖动时要每帧命令式调它，
      // 否则只有松手那一刻才看得见线（React 重渲染跟不上 pointermove）。
      var draw = function () {
        var canvas = canvasRef.current
        var r = rectRef.current
        if (canvas === null || r === null) return
        var dpr = window.devicePixelRatio || 1
        var w = Math.max(1, Math.round(r.w * dpr))
        var hgt = Math.max(1, Math.round(r.h * dpr))
        if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt }
        var c2d = canvas.getContext('2d')
        c2d.clearRect(0, 0, canvas.width, canvas.height)
        if (modeRef.current === 'mark' && hoveringRef.current) {
          // Codex 的选框：2px 蓝色虚线 + 10% 淡填
          c2d.save()
          c2d.fillStyle = ACCENT_SOFT
          c2d.fillRect(0, 0, canvas.width, canvas.height)
          c2d.setLineDash([6 * dpr, 4 * dpr])
          c2d.lineWidth = 2 * dpr
          c2d.strokeStyle = ACCENT
          c2d.strokeRect(dpr, dpr, canvas.width - 2 * dpr, canvas.height - 2 * dpr)
          c2d.restore()
        }
        var list = strokesRef.current
        for (var i = 0; i < list.length; i += 1) paintStroke(c2d, list[i], canvas.width, canvas.height, dpr)
        if (liveRef.current !== null) paintStroke(c2d, liveRef.current, canvas.width, canvas.height, dpr)
      }
      var drawRef = React.useRef(draw); drawRef.current = draw
      React.useEffect(function () { drawRef.current() }, [rect, strokes, hovering, mode])

      var toNorm = function (event) {
        var r = rectRef.current
        if (r === null || r.w === 0 || r.h === 0) return null
        return [(event.clientX - r.x) / r.w, (event.clientY - r.y) / r.h]
      }
      // 形状是「拉」出来的：屏幕像素上小于 4px 的当误触，不落笔
      var shapeTooSmall = function (a, b) {
        var r = rectRef.current
        if (r === null) return true
        return Math.abs((b[0] - a[0]) * r.w) < 4 && Math.abs((b[1] - a[1]) * r.h) < 4
      }

      var onPointerDown = function (event) {
        if (busy || rectRef.current === null) return
        var tool = modeRef.current
        if (tool === 'mark') {
          var pt = toNorm(event)
          if (pt === null) return
          var id = 'm' + Date.now() + Math.round(Math.random() * 1000)
          var marker = { id: id, nx: pt[0], ny: pt[1], text: '', t: nextSeq() }
          setMarkers(function (prev) { return prev.concat([marker]) })
          setRedoStack([])   // 做了新动作，重做链就断了
          setEditing(id)
          return
        }
        var p = toNorm(event)
        if (p === null) return
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch (_) {}
        liveRef.current = {
          kind: tool, color: color, w: weightRef.current,
          pts: SHAPE_TOOLS[tool] === 1 ? [p, p] : [p],
        }
        drawRef.current()
      }
      var onPointerMove = function (event) {
        var live = liveRef.current
        if (live === null) return
        var p = toNorm(event)
        if (p === null) return
        if (SHAPE_TOOLS[live.kind] === 1) live.pts = [live.pts[0], p]
        else live.pts.push(p)
        drawRef.current()   // 拖动途中就地重画：松手之前也看得见线
      }
      var onPointerUp = function (event) {
        var live = liveRef.current
        liveRef.current = null
        if (live === null) return
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch (_) {}
        if (SHAPE_TOOLS[live.kind] === 1 && shapeTooSmall(live.pts[0], live.pts[live.pts.length - 1])) {
          drawRef.current()
          return
        }
        var stroke = { kind: live.kind, color: live.color, w: live.w, pts: live.pts, t: nextSeq() }
        setStrokes(function (prev) { return prev.concat([stroke]) })
        setRedoStack([])
      }

      var setMarkerText = function (id, text) {
        setMarkers(function (prev) {
          return prev.map(function (m) { return m.id === id ? { id: m.id, nx: m.nx, ny: m.ny, text: text, t: m.t } : m })
        })
      }
      var removeMarker = function (id) {
        setMarkers(function (prev) { return prev.filter(function (m) { return m.id !== id }) })
        setEditing(function (cur) { return cur === id ? null : cur })
      }
      // 撤销按「谁后做的撤谁」走：标记和笔迹各带一个递增序号，比大小，不按类别挑
      var undoLast = function () {
        var s = strokesRef.current
        var m = markersRef.current
        var lastStroke = s.length === 0 ? -1 : s[s.length - 1].t
        var lastMark = m.length === 0 ? -1 : m[m.length - 1].t
        if (lastStroke < 0 && lastMark < 0) return
        if (lastStroke > lastMark) {
          var popped = s[s.length - 1]
          setStrokes(function (prev) { return prev.slice(0, -1) })
          setRedoStack(function (prev) { return prev.concat([{ type: 'stroke', item: popped }]) })
        } else {
          var gone = m[m.length - 1]
          removeMarker(gone.id)
          setRedoStack(function (prev) { return prev.concat([{ type: 'marker', item: gone }]) })
        }
      }
      // 重做：把上一次撤销的东西原样放回去（保留原来的序号，便于继续撤销）
      var redoLast = function () {
        var stack = redoStackRef.current
        if (stack.length === 0) return
        var top = stack[stack.length - 1]
        setRedoStack(function (prev) { return prev.slice(0, -1) })
        if (top.type === 'stroke') setStrokes(function (prev) { return prev.concat([top.item]) })
        else setMarkers(function (prev) { return prev.concat([top.item]) })
      }

      var compose = function () {
        var img = imgRef.current
        var rawW = img.naturalWidth || 1
        var rawH = img.naturalHeight || 1
        // 最长边超过 4096 就等比缩：一张 8000×6000 的原图直接导会占近 200MB 内存，容易卡死侧栏
        var limit = 4096
        var shrink = Math.min(1, limit / Math.max(rawW, rawH))
        var nw = Math.max(1, Math.round(rawW * shrink))
        var nh = Math.max(1, Math.round(rawH * shrink))
        var out = document.createElement('canvas')
        out.width = nw
        out.height = nh
        var c2d = out.getContext('2d')
        c2d.drawImage(img, 0, 0, nw, nh)
        var scale = (nw / Math.max(rect.w, 1))
        for (var i = 0; i < strokes.length; i += 1) paintStroke(c2d, strokes[i], nw, nh, scale)
        for (var j = 0; j < markers.length; j += 1) paintMarker(c2d, markers[j], j, nw, nh)
        return out
      }

      var buildText = function () {
        var lines = markers.map(function (m, i) {
          var note = (m.text || '').trim()
          return (i + 1) + '. ' + (note === '' ? '（未写说明）' : note)
        })
        if (lines.length === 0) return ''
        return T.noteHeader + '\n' + lines.join('\n') + '\n' + T.noteTail
      }

      var doSend = async function () {
        if (busy) return
        if (markers.length === 0 && strokes.length === 0) { setErr(T.empty); return }
        if (sessionId === undefined || sessionId === null) { setErr(T.noSession); return }
        setBusy(true)
        setErr('')
        try {
          var out = compose()
          var blob = await new Promise(function (resolve, reject) {
            try { out.toBlob(function (b) { b === null ? reject(new Error('toBlob failed')) : resolve(b) }, 'image/png') }
            catch (e) { reject(e) }
          })
          var name = 'annotation-' + baseNameOf(absolutePath).replace(/\.[^.]+$/, '') + '-' + Date.now() + '.png'
          var file = new File([blob], name, { type: 'image/png' })
          await sendAnnotation(ctx, sessionId, file, buildText())
          onDone()
        } catch (e) {
          setErr(fmt(T.failed, { message: (e && e.message) || String(e) }))
        } finally {
          setBusy(false)
        }
      }

      // ---- 键盘 ----
      // 挂在 window 上、capture 阶段：这样官方组件的快捷键先让位给批注层，
      // 又不会因为焦点跑到画布外面就失灵。写说明框里打字时整段跳过（见 typing）。
      var editingRef = React.useRef(null); editingRef.current = editing
      var undoRef = React.useRef(undoLast); undoRef.current = undoLast
      var redoRef = React.useRef(redoLast); redoRef.current = redoLast
      var onDoneRef = React.useRef(onDone); onDoneRef.current = onDone
      React.useEffect(function () {
        var onKey = function (event) {
          var target = event.target
          // 只有焦点在「我自己的说明卡」里才算在打字。会话输入框是 contenteditable，
          // 若把它也当输入区，用户点开批注后焦点还留在输入框，R/S/T 就全哑了。
          var typing = target !== null && target !== undefined && typeof target.closest === 'function'
            ? target.closest('.dsa-card') !== null
            : false
          var key = String(event.key || '').toLowerCase()
          if (key === 'escape') {
            event.stopPropagation()
            if (editingRef.current !== null) setEditing(null)
            else onDoneRef.current()
            return
          }
          if (typing) return
          // 撤销 / 重做：Ctrl+Z、Ctrl+Shift+Z、Ctrl+Y 三种都认（Codex 也是撤销重做并列）
          if (event.ctrlKey || event.metaKey) {
            if (key === 'z' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); undoRef.current(); return }
            if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); event.stopPropagation(); redoRef.current(); return }
          }
          if (event.ctrlKey || event.metaKey || event.altKey) return
          var hit = null
          for (var i = 0; i < TOOL_ORDER.length; i += 1) {
            if (TOOL_KEYS[TOOL_ORDER[i]] === key) hit = TOOL_ORDER[i]
          }
          if (hit !== null) { event.preventDefault(); setMode(hit); return }
          if (key === '[') { event.preventDefault(); stepWeight(-1); return }
          if (key === ']') { event.preventDefault(); stepWeight(1); return }
        }
        window.addEventListener('keydown', onKey, true)
        return function () { window.removeEventListener('keydown', onKey, true) }
      }, [])

      // ---- 指针 ----
      // 这个浮层 portal 到 document.body，落在 React 根之外，合成指针事件实测一个都收不到。
      // 所以绕开事件系统：直接在 canvas 节点上挂原生监听，处理逻辑仍走上面那几个闭包。
      var handlersRef = React.useRef(null)
      handlersRef.current = {
        down: onPointerDown, move: onPointerMove, up: onPointerUp,
        enter: function () { setHovering(true) },
        leave: function () { setHovering(false) },
      }
      var canvasReady = rect !== null && visible && !missing
      React.useEffect(function () {
        var canvas = canvasRef.current
        if (canvas === null) return undefined
        var call = function (name) {
          return function (event) { if (handlersRef.current !== null) handlersRef.current[name](event) }
        }
        var down = call('down'); var move = call('move'); var up = call('up')
        var enter = call('enter'); var leave = call('leave')
        canvas.addEventListener('pointerdown', down)
        canvas.addEventListener('pointermove', move)
        canvas.addEventListener('pointerup', up)
        canvas.addEventListener('pointercancel', up)
        canvas.addEventListener('pointerenter', enter)
        canvas.addEventListener('pointerleave', leave)
        return function () {
          canvas.removeEventListener('pointerdown', down)
          canvas.removeEventListener('pointermove', move)
          canvas.removeEventListener('pointerup', up)
          canvas.removeEventListener('pointercancel', up)
          canvas.removeEventListener('pointerenter', enter)
          canvas.removeEventListener('pointerleave', leave)
        }
      }, [canvasReady])

      var hintFor = function (tool) {
        if (tool === 'arrow') return T.hintArrow
        if (tool === 'rect') return T.hintRect
        if (tool === 'square') return T.hintSquare
        if (tool === 'triangle') return T.hintTriangle
        if (tool === 'pen') return T.hintPen
        return T.hintMark
      }
      var widthNames = [T.widthThin, T.widthMid, T.widthThick]

      if (missing) return h('div', { className: 'dsa-msg', style: { top: 80, left: 80 } }, T.noImage)
      if (rect === null || !visible) return null

      var editingMarker = null
      for (var mi = 0; mi < markers.length; mi += 1) if (markers[mi].id === editing) editingMarker = markers[mi]
      var cardLeft = rect.x + rect.w + 8
      if (cardLeft + 280 > window.innerWidth) cardLeft = Math.max(8, rect.x - 276)
      var cardTop = editingMarker === null ? 80 : Math.max(8, Math.min(window.innerHeight - 160, rect.y + editingMarker.ny * rect.h - 30))
      var pillTop = Math.min(window.innerHeight - 68, rect.y + rect.h + 8)
      var pillLeft = Math.max(8, rect.x)

      return h(React.Fragment, null,
        h('canvas', {
          ref: canvasRef,
          className: 'dsa-ink',
          'data-mode': mode === 'mark' ? 'mark' : 'draw',
          style: { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
        }),
        markers.map(function (m, i) {
          return h('div', {
            key: m.id,
            className: 'dsa-mark',
            'data-active': editing === m.id ? '1' : '0',
            style: { left: rect.x + m.nx * rect.w, top: rect.y + m.ny * rect.h },
            title: m.text || T.placeholder,
            onClick: function (event) { event.stopPropagation(); setEditing(m.id) },
          }, String(i + 1))
        }),
        editingMarker !== null ? h('div', {
          className: 'dsa-card',
          style: { left: cardLeft, top: cardTop },
        },
          h('textarea', {
            autoFocus: true,
            value: editingMarker.text,
            placeholder: T.placeholder,
            onChange: function (event) { setMarkerText(editingMarker.id, event.target.value) },
            onKeyDown: function (event) {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); setEditing(null) }
            },
          }),
          h('div', { className: 'dsa-cardrow' },
            h('button', { className: 'dsa-mini', type: 'button', onClick: function () { removeMarker(editingMarker.id) } }, T.remove),
            h('div', { className: 'dsa-spacer' }),
            h('button', { className: 'dsa-primary', type: 'button', onClick: function () { setEditing(null) } }, T.save))) : null,
        h('div', {
          className: 'dsa-pill',
          style: {
            left: pillLeft, top: pillTop,
            // 六个工具 + 四色 + 三档粗细 + 收口，横排放不下就换行，但绝不超出图片区右沿
            boxSizing: 'border-box',
            maxWidth: Math.max(220, Math.min(window.innerWidth - pillLeft - 8, Math.max(rect.w, 320))),
          },
        },
          // 工具格：标记 / 画笔 / 箭头 / 长方形 / 正方形 / 三角形
          TOOL_ORDER.map(function (tool) {
            var label = T['tool_' + tool]
            var kbd = TOOL_KEYS[tool].toUpperCase()
            return h('button', {
              key: tool, className: 'dsa-tool', type: 'button',
              'data-active': mode === tool ? '1' : '0',
              title: label + ' (' + kbd + ')',
              'aria-label': label,
              'aria-pressed': mode === tool ? 'true' : 'false',
              onClick: function () { setMode(tool) },
            }, toolIcon(tool))
          }),
          h('span', { className: 'dsa-sep' }),
          // 颜色：四个预设 + 一个自定义取色块（Codex 那边是完整取色器）
          PEN_COLORS.map(function (c) {
            return h('button', {
              key: c, className: 'dsa-swatch', type: 'button', 'data-active': c === color ? '1' : '0',
              style: { background: c }, title: c, 'aria-label': c,
              onClick: function () { setColor(c) },
            })
          }),
          h('label', {
            className: 'dsa-custom',
            title: T.moreColor,
            style: { background: PEN_COLORS.indexOf(color) >= 0 ? 'conic-gradient(from 0deg,#ff3b30,#ffcc00,#34c759,#339cff,#ff3b30)' : color },
          }, h('input', {
            type: 'color', value: color, 'aria-label': T.moreColor,
            onChange: function (event) { setColor(event.target.value) },
          })),
          h('span', { className: 'dsa-sep' }),
          // 粗细：三个预设点 + 一条连续滑块（照 Codex 的 brushSize + size menu）
          PEN_WEIGHTS.map(function (w, wi) {
            var dot = 4 + wi * 3.5
            return h('button', {
              key: 'w' + w, className: 'dsa-wbtn', type: 'button',
              'data-active': weight === w ? '1' : '0',
              title: widthNames[wi] + ' ' + w + 'px ( [ / ] )',
              'aria-label': T.width + ' ' + widthNames[wi],
              'aria-pressed': weight === w ? 'true' : 'false',
              onClick: function () { setWeight(w) },
            }, h('i', { style: { width: dot, height: dot, background: color } }))
          }),
          h('input', {
            type: 'range', className: 'dsa-range', min: 1, max: 12, step: 1,
            value: weight, title: T.width + ' ' + weight + 'px',
            'aria-label': T.width,
            onChange: function (event) { setWeight(Number(event.target.value)) },
          }),
          h('span', { className: 'dsa-sep' }),
          h('button', {
            className: 'dsa-mini', type: 'button',
            disabled: busy || (strokes.length === 0 && markers.length === 0),
            title: 'Ctrl+Z', onClick: undoLast,
          }, T.undo),
          h('button', {
            className: 'dsa-mini', type: 'button', disabled: busy || redoStack.length === 0,
            title: 'Ctrl+Shift+Z / Ctrl+Y', onClick: redoLast,
          }, T.redo),
          h('button', {
            className: 'dsa-mini', type: 'button', disabled: busy || strokes.length === 0,
            onClick: function () { setStrokes([]); setRedoStack([]) },
          }, T.clear),
          h('span', { className: 'dsa-sep' }),
          h('span', null, fmt(T.marked, { n: markers.length })),
          h('button', { className: 'dsa-mini', type: 'button', disabled: busy, onClick: onDone }, T.cancel),
          h('button', { className: 'dsa-primary', type: 'button', disabled: busy, onClick: doSend },
            busy ? T.sending : T.send),
          // 第二行：当前工具怎么用 + 整张键位表。工具键不用记，看这一行就够。
          h('div', { className: 'dsa-hint' }, hintFor(mode) + ' · ' + T.hintKeys),
        ),
        err !== '' ? h('div', { className: 'dsa-msg', style: { left: pillLeft, top: pillTop + 62 } }, err) : null)
    }

    // ============================== 头部按钮 ==============================
    function AnnotateAction(props) {
      var T = t()
      var absolutePath = props.absolutePath
      var onState = React.useState(false); var on = onState[0]; var setOn = onState[1]
      if (!isImagePath(absolutePath)) return null
      var layer = on
        ? ReactDOM.createPortal(h(AnnotateLayer, {
            ctx: props.ctx, absolutePath: absolutePath, sessionId: props.sessionId,
            onDone: function () { setOn(false) },
          }), document.body)
        : null
      return h(React.Fragment, null,
        h('button', {
          className: 'dsa-btn', type: 'button', 'data-on': on ? '1' : '0',
          title: T.actionTitle, 'aria-pressed': on ? 'true' : 'false',
          onClick: function () { setOn(!on) },
        }, iconPen(), h('span', null, on ? T.actionOn : T.action)),
        layer)
    }

    // ============================== 插件体 ==============================
    function apply(ctx) {
      hostCtx = ctx
      try {
        ctx.effect(function () {
          return ctx.slots.inject('sidebar.right.tab.document.actions', function () {
            return ctx.slots.register({
              name: 'sidebar.right.tab.document.actions',
              id: 'dsh-sidebar-annotate/image',
              order: 10,
              registrant: 'dsh-sidebar-annotate',
              inject: function (sessionId) { return { ctx: ctx, sessionId: sessionId } },
            }, AnnotateAction)
          })
        }, 'sidebar-annotate: document actions')
      } catch (err) {
        console.warn('[sidebar-annotate] 注册头部按钮失败：', err)
      }
    }

    exports.inject = ['slots', 'sessions', 'conversation', 'locale']
    exports.apply = apply
    return module.exports
  },
})
