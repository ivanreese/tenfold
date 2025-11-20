// STUFF WHAT OUGHT GO IN AUTOMERGE MAYBE SOMEHOW
// this array holds all the letter-drawing functions that can be loaded for each cell in the grid.
// as people add new functions (somehow?), they can be instantiated into this array (somehow?)
const allLetters = [
  [bounds, placeholder("I"), catenoid],
  [bounds, placeholder("N")],
  [bounds, placeholder("K")],
  [bounds, placeholder("S")],
  [bounds, placeholder("W"), doubleyou],
  [bounds, placeholder("I")],
  [bounds, placeholder("T")],
  [bounds, placeholder("C")],
  [bounds, placeholder("H")],
]
// this array will hold the probably-should-be-persisted state of each letter in the grid,
// including references (by array index) to functions inside allLetters.
const states = []

let currentlyEditingIdx = 0

// CONFIG
const thick = 2 // css pixels
const cycleTime = 8 // how many seconds per anim loop
const color = "#fff"
const errColor = "#f00"
const MAX_DPR = 2 // Limit the DPR so we don't burn too much time
// ugh this shit aint resolution independent what a hack
const padding = 30
const gap = 30
const clockWaveHeight = 20

// ANIMATION STATE
let t = 0
const timers = []

// HELPFUL HELPERS
// Ideally, all this stuff (or better equivalents) would be available to people writing letter functions
const PI = Math.PI
const TAU = PI * 2

const mod = (v, m = 1) => ((v % m) + m) % m
const rand = (lo = -1, hi = 1) => denorm(Math.random(), lo, hi)
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v))
const norm = (n, lo = -1, hi = 1) => (n - lo) / (hi - lo)
const denorm = (n, lo = -1, hi = 1) => n * (hi - lo) + lo
const declip = (n, lo = 0, hi = 1) => denorm(norm(n), lo, hi)
const renorm = (v, lo = -1, hi = 1, LO = -1, HI = 1, doClamp = false) => {
  let n = norm(v, lo, hi)
  if (doClamp) n = clamp(n, lo, hi)
  return denorm(n, LO, HI)
}

// UNHELPFUL HELPERS

class Averager {
  result = 0
  tally = 0
  values = []

  constructor(limit) {
    this.limit = limit
  }

  add(value) {
    this.tally += value
    this.values.push(value)
    while (this.values.length > this.limit) this.tally -= this.values.shift()
    this.result = this.tally / this.values.length
    return this.result
  }
}

// CANVAS /////////////////////////////////////////////////////////////////////////////////////////

const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d", { alpha: true })
let dpr // device pixel ratio, sigh
let cssW // width of a grid cell in css units
let pixW // width of a grid cell in canvas pixels
let pixHW // half the width of a grid cell in canvas pixels

function resize() {
  // If we need to nest the canvas within a smaller area, specify that area here
  let parentWidth = window.innerWidth
  let parentHeight = window.innerHeight

  // calculate the "dead" width/height, eaten up by gaps and padding
  let dw = padding * 2 + gap * 2
  let dh = padding * 2 + gap * 3

  // This is the max area the canvas will be contained within, in CSS pixels
  let iw = parentWidth - dw
  let ih = parentHeight - dh

  // This is the size of a grid cell in CSS pixels
  cssW = Math.min(iw / 3, ih / 4)

  // We need the half-width (hw) to be floored, so we sized things based on that
  cssW = Math.floor(cssW / 2) * 2

  // Now, scale the canvas to cover all grid cells plus gaps and padding
  canvas.style.width = cssW * 3 + dw + "px"
  canvas.style.height = cssW * 4 + dh + "px"

  // Now calculate the internal pixel dimensions of the canvas
  dpr = clamp(Math.round(window.devicePixelRatio || 1), 1, MAX_DPR)
  pixW = cssW * dpr // width
  pixHW = pixW / 2 // half-width — we ensured that this is an integer
  canvas.width = pixW * 3 + dw * dpr
  canvas.height = pixW * 4 + dh * dpr
}
resize()
window.addEventListener("resize", resize)

// INPUT HANDLING /////////////////////////////////////////////////////////////////////////////////

let dragType // null, cell, param, or timeline
let dragParam // the cell idx for the currently dragged param
let mouseStart // state captured when the mouse is first pressed
let mouseDragged // state captured as the mouse is dragged

canvas.addEventListener("pointerdown", (e) => {
  // We assume this mouse press will result in a drag, and will cancel it if not
  window.addEventListener("pointermove", drag)

  // capture the canvas-relative position, and the offset from the window to the canvas
  mouseStart = { x: e.offsetX, y: e.offsetY, ox: e.clientX - e.offsetX, oy: e.clientY - e.offsetY }

  // First, we need to figure out which region of the grid we clicked within

  // Shift mouse origin to top left of grid, divide by "enlarged" grid cells.
  // Since it includes gap, gx,gy is 0,0 at cell 0 TL and 1,1 at cell 4 TL
  let gx = (mouseStart.x - padding) / (cssW + gap)
  let gy = (mouseStart.y - padding) / (cssW + gap)

  // Get the column and row, and state (which might be null if we clicked outside the grid)
  let C = gx | 0
  let R = gy | 0
  let i = C + R * 3

  // These are normalized coords *within* the current cell — we've now carved off the gap
  let lx = ((gx - C) * (cssW + gap)) / cssW
  let ly = ((gy - R) * (cssW + gap)) / cssW

  // normalized position used by stuff in the kaoss pad
  let kx = (mouseStart.x - padding - cssW - gap) / (cssW * 2 + gap)
  let ky = ((gy - 1) * (cssW + gap)) / (cssW - clockWaveHeight - gap)

  // Update the mouse with all this extra context
  mouseStart = { ...mouseStart, C, R, i, lx, ly, kx, ky }
  mouseDragged = { x: e.clientX - mouseStart.ox, y: e.clientY - mouseStart.oy, dx: e.movementX, dy: e.movementY, C, R, i, lx, ly, kx, ky }

  // Check if we're inside a cell
  let lxInside = lx >= 0 && lx <= 1
  let lyInside = ly >= 0 && ly <= 1

  // Check if we're inside one of the letters
  if (lxInside && lyInside && R != 1) {
    dragType = "cell"
    return
  }

  // If we're in the gap under a letter, we do selector and bail
  if (lxInside && ly > 1 && R != 1) {
    if (R > 0) i -= 3
    let s = states[i]
    if (lx < 0.33) s.letterIdx = mod(s.letterIdx + (lx < 0.17 ? -1 : 1), allLetters[i].length)
    if (lx > 0.95) currentlyEditingIdx = i
    return
  }

  // if it's in cell 3, we do ampersand stuff
  if (i == 3) {
    return
  }

  // if it's in the global kaoss pad, we find the closest draggable
  if (i == 4 || i == 5) {
    // are we dragging the time wave scrubber thingy?
    if (lyInside && ly > 0.8) {
      dragType = "timeline"
      return
    } else {
      // grab the closest draggable param grid thingy
      dragParam = null
      let closestDist = 0.3 // need to be within this dist for the drag to count
      for (let p = 0; p < states.length; p++) {
        let s = states[p]
        let dist = Math.hypot(clamp(denorm(kx)) - s.q, clamp(denorm(ky)) - s.r)
        if (dist >= closestDist) continue
        dragParam = p
        closestDist = dist
      }
      if (dragParam != null) {
        dragType = "param"
        return
      }
    }
  }

  // nothing happened, I guess — abort the drag
  pointerup()
})

const drag = (e) => {
  e.preventDefault() // Prevent unwanted text selection

  // use the initial offset from the window to the canvas to compute an updated canvas-relative mouse pos
  mouseDragged = { x: e.clientX - mouseStart.ox, y: e.clientY - mouseStart.oy, dx: e.movementX, dy: e.movementY }

  // Shift mouse origin to top left of grid, divide by "enlarged" grid cells.
  // Since it includes gap, gx,gy is 0,0 at cell 0 TL and 1,1 at cell 4 TL
  let gx = (mouseDragged.x - padding) / (cssW + gap)
  let gy = (mouseDragged.y - padding) / (cssW + gap)

  // These are normalized coords within the START cell
  let lx = ((gx - mouseStart.C) * (cssW + gap)) / cssW
  let ly = ((gy - mouseStart.R) * (cssW + gap)) / cssW

  // normalized position used by stuff in the kaoss pad
  let kx = (mouseDragged.x - padding - cssW - gap) / (cssW * 2 + gap)
  let ky = ((gy - 1) * (cssW + gap)) / (cssW - clockWaveHeight - gap)

  // Update the mouse with all this extra context
  mouseDragged = { ...mouseDragged, lx, ly, kx, ky }

  if (dragType == "cell") {
    let s = states[mouseStart.i]
    s.x = clamp(denorm(lx))
    s.y = clamp(denorm(ly))
  } else if (dragType == "param") {
    let s = states[dragParam]
    s.q = clamp(denorm(kx))
    s.r = clamp(denorm(ky))
  }
}

const pointerup = (e) => {
  dragType = null
  window.removeEventListener("pointermove", drag)
}

window.addEventListener("pointerup", pointerup)
window.addEventListener("pointercancel", pointerup)

// FONT ///////////////////////////////////////////////////////////////////////////////////////////

const chars = {}

{
  let font = await fetch("font.txt").then((r) => r.text())
  let current = null
  let paths = []
  let path = []

  for (let line of font.split("\n")) {
    line = line.trim()
    if (!line) continue

    if (line.startsWith("StartChar")) {
      current = line.split(" ")[1].trim()
      paths = chars[current] = []
    } else if (line === "EndChar") {
      current = null
    } else if (current) {
      const m = line.match(/^(\d+)\s+(\d+)\s+m$/)
      const l = line.match(/^(\d+)\s+(\d+)\s+l$/)

      if (m) {
        path = [{ x: +m[1], y: +m[2] }]
        paths.push(path)
      } else if (l) {
        path.push({ x: +l[1], y: +l[2] })
      }
    }
  }
}

// DRAWING API ////////////////////////////////////////////////////////////////////////////////////

// This is the simplified canvas API exposed to letter-drawing functions.
// While we don't do this yet, the plan is to add instrumentation that'll feed the sound engine.
let newPath = true
const api = {
  begin() {
    newPath = true
  },
  move(x, y) {
    ctx.moveTo(x, y)
    newPath = false
  },
  line(x, y) {
    if (newPath) {
      api.move(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  },
  rect(x, y, w, h) {
    ctx.moveTo(x, y)
    ctx.rect(x, y, w, h)
    newPath = true
  },
  circle(x, y, r) {
    ctx.moveTo(x + r, y)
    api.arc(x, y, r)
    newPath = true
  },
  arc(x, y, r, start = 0, end = 1, ccw = false) {
    ctx.arc(x, y, r, start * TAU, end * TAU, ccw)
  },
  text(str, x, y, size = 16, k = size * 0.75) {
    let _x = x
    for (let c of str) {
      // perform a newline
      if (c == "\n") {
        y += size
        x = _x
        continue
      }
      // render non-whitespace chars
      if (c != " ") {
        let char = chars[c] ?? chars["?"]
        for (let path of char) {
          newPath = true
          for (let p of path) {
            let X = x + (p.x * size) / 800
            let Y = y + size - (p.y * size) / 800 // y is flipped
            api.line(X, Y)
          }
        }
      }
      // advance
      x += k
    }
  },
}

// ENGINE /////////////////////////////////////////////////////////////////////////////////////////

// Initialize the param state for each letter
for (let i = 0; i < 9; i++) {
  let s = (states[i] = {})
  s.letterIdx = 0
  s.q = renorm(i, 0, 8, -1, 1)
  s.r = 0
  s.x = 0
  s.y = 0
  timers[i] = new Averager(10)
}

let mappers = Array.from("INKSWITCH")
let lastT

function update(ms) {
  requestAnimationFrame(update)
  if (document.hidden) return

  let newT = ms / 1000 / cycleTime
  lastT ??= newT
  if (dragType == "timeline") t = 0.5 + mouseDragged.kx
  else t += newT - lastT
  lastT = newT

  ctx.resetTransform()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineJoin = ctx.lineCap = "round"

  let scaleFix = cssW / 200 // oops, forgot to account for this, quick hack it!

  for (let i = 0; i < 9; i++) {
    let s = states[i]
    let fn = allLetters[i][s.letterIdx]
    let C = Math.floor(i % 3)
    let _R = Math.floor(i / 3)
    let R = _R > 0 ? _R + 1 : _R

    // Transform to letter space
    ctx.resetTransform()
    ctx.translate(C * pixW, R * pixW) // center on the current grid cell
    ctx.translate(dpr * padding, dpr * padding) // padding
    ctx.translate(dpr * gap * C, dpr * gap * R) // gaps
    ctx.scale(pixHW, pixHW) // 0 to 2
    ctx.translate(1, 1) // -1 to 1
    // line width is calculated when .stroke() is called, and is affected by scale,
    // so we need to undo the effect of grid scaling (but not dpr).
    ctx.lineWidth = 2 * thick * (dpr / pixW)

    // Draw the letter!
    let start = performance.now()
    newPath = true
    ctx.beginPath()
    fn(api, s.q, s.r, t, s.x, s.y)
    ctx.stroke()
    let cost = timers[i].add(performance.now() - start)

    // TEMP: Draw the per-letter control handles
    // ctx.beginPath()
    // proxy.circle(s.x, s.y, 0.05)
    // ctx.fill()

    // If the draw function took too long, apply shame
    if (cost > 3) {
      ctx.beginPath()
      ctx.lineWidth *= 3
      ctx.strokeStyle = errColor
      api.text("COST : " + cost.toFixed(1) + " > 3", -1, -1, 0.15)
      ctx.stroke()
      // clean up after yoself
      ctx.strokeStyle = color
      ctx.lineWidth /= 3
    }

    // Draw the kaoss pad draggable
    ctx.resetTransform()
    ctx.translate(pixW, pixW) // origin at the TL corner of the kaoss pad
    ctx.translate(dpr * padding, dpr * padding) // padding
    ctx.translate(dpr * gap, dpr * gap) // gaps
    ctx.scale(pixW, pixW) // 0 to 1 for one grid cell
    ctx.lineWidth /= 2 // we just doubled the scale, so halve the line width

    // kaoss pad is x: 0-2, y: 0-1
    ctx.beginPath()
    let gs = 0.025 // size of the grid
    // m rows by n cols
    for (let m = 0; m < 3; m++) {
      for (let n = 0; n < 3; n++) {
        let W = 2 + gap / cssW - gs * 3
        let H = 1 - (clockWaveHeight * scaleFix + gap) / cssW - gs * 3
        let X = gs * n + declip(s.q, 0, W)
        let Y = gs * m + declip(s.r, 0, H)
        if (m * 3 + n == i) ctx.fillRect(X, Y, gs, gs)
        api.rect(X, Y, gs, gs)
      }
    }
    ctx.stroke()

    // Draw the letter selector
    ctx.resetTransform()
    ctx.scale(dpr, dpr)
    ctx.translate(C * cssW, R * cssW) // center on the current grid cell
    ctx.translate(padding, padding) // padding
    ctx.translate(gap * C, gap * R) // gaps
    ctx.lineWidth = thick
    {
      let charWidth = 10 * scaleFix
      let charHeight = 11 * scaleFix // this font is weird
      let labelText = mappers[i] + states[i].letterIdx.toString().padStart(2, 0)
      let labelWidth = charWidth * labelText.length
      let x = 17 * scaleFix + labelWidth / 2
      let y = cssW + gap / 2
      ctx.beginPath()
      api.text(labelText, x - labelWidth / 2, y - scaleFix - charHeight / 2, 16 * scaleFix, charWidth)
      api.move(x - 26 * scaleFix, y - charHeight / 2)
      api.line(x - 32 * scaleFix, y + 0)
      api.line(x - 26 * scaleFix, y + charHeight / 2)
      api.move(x + 26 * scaleFix, y - charHeight / 2)
      api.line(x + 32 * scaleFix, y + 0)
      api.line(x + 26 * scaleFix, y + charHeight / 2)
      ctx.stroke()

      // edit & fork
      ctx.beginPath()
      api.circle(cssW - 6 * scaleFix, y, 6 * scaleFix)
      if (currentlyEditingIdx == i) ctx.fill()
      else ctx.stroke()
    }
  }

  // DAWN OF THE SECOND ROW

  // &
  ctx.resetTransform()
  ctx.translate(0, pixW) // center on the current grid cell
  ctx.translate(dpr * padding, dpr * padding) // padding
  ctx.translate(0, dpr * gap) // gaps
  ctx.scale(pixHW, pixHW) // 0 to 2
  ctx.translate(1, 1) // -1 to 1
  ctx.lineWidth = 2 * thick * (dpr / pixW)

  {
    let r = 0.3
    ctx.beginPath()
    api.arc(0, -0.5, r, 0, -0.25, true)
    api.arc(-0.75, -0.5, r, -0.25, 0.25, true)
    api.line(-0.6, -0.2)
    api.move(-0.6, -0.1)
    api.arc(-0.75, 0.2, r, -0.25, -0.5, true)
    api.arc(-0.75, 0.8, r, 0.5, 0.25, true)
    api.arc(0.5, 0.8, r, 0.25, 0, true)
    api.line(0.8, 0.5)
    api.line(0.8 - 0.8, 0.5 + 0.1)
    api.move(0.8, 0.5)
    api.line(0.8 + 0.8, 0.5 - 0.1)
    ctx.stroke()

    ctx.beginPath()
    api.circle(0.8, 0.5, 0.04)
    ctx.fill()
  }

  // Clock wave
  ctx.resetTransform()
  ctx.scale(dpr, dpr)
  ctx.translate(padding, padding) // padding
  ctx.translate(gap + cssW, cssW + gap + cssW) // 0,0 at the BL corner of the kaoss pad
  ctx.lineWidth = thick
  for (let i = 0; i <= 1.0001; i += 0.02) {
    ctx.beginPath()
    let phase = (((i - t + 0.5) % 1) + 1) % 1 // 0 to 1
    let p = Math.abs(denorm(phase)) // 1 to 0 to 1
    p **= 2.5
    ctx.lineWidth = denorm(Math.min((1 - Math.abs(denorm(i))) * 4, 1) * p, 0.5, 5)
    let x = cssW * i * 2 + gap * i
    ctx.moveTo(x, -clockWaveHeight * scaleFix)
    ctx.lineTo(x, 0)
    ctx.stroke()
  }
}

// INIT
requestAnimationFrame(update)

// EXAMPLE LETTER FUNCTIONS ///////////////////////////////////////////////////////////////////////

function bounds(ctx) {
  ctx.rect(-1, -1, 2, 2)
}

function placeholder(str) {
  return (ctx, q, r, t, X, Y) => {
    ctx.text(str, -0.725, -0.8, 2)
  }
}

function catenoid(ctx, q, r, t, X, Y) {
  let U = Math.round(24 + Math.round(X * 10) * 2) // segments around the circle
  let V = Math.round(10 + Y * 8) // segments along the curve
  let rad = 0.1 // shift the curve away from the y axis
  let a = r + 1.4 // factor for the catenary curve
  let tilt = q * 0.2 + 0.2 // rotation around the x axis
  let roll = Math.sin(t * TAU) ** 7 * 0.03 // animated roll around the z axis
  let points = []
  let xmin = 0
  let xmax = 0
  let ymin = 0
  let ymax = 0

  let point = (u, v) => {
    // Draw the catenary curve in the xy plane
    let y = denorm(v / V)
    let x = rad + a * Math.cosh(y / a) - a
    let z = 0

    // Lathe around the Y axis
    let uf = TAU * (u / U - 0.25)
    let x1 = x * Math.cos(uf) - z * Math.sin(uf)
    let z1 = x * Math.sin(uf) + z * Math.cos(uf)

    // Tilt around the X axis (for visual interest)
    let y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt)
    let z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt)

    // Roll around the Z axis (animation)
    let x2 = x1 * Math.cos(roll) - y1 * Math.sin(roll)
    let y2 = x1 * Math.sin(roll) + y1 * Math.cos(roll)

    return { x: x2, y: y2 }
  }

  // build all points, and track the bounds
  for (let u = 0; u < U; u++) {
    for (let v = 0; v <= V; v++) {
      let p = point(u, v)
      points.push(p)
      xmin = Math.min(p.x, xmin)
      xmax = Math.max(p.x, xmax)
      ymin = Math.min(p.y, ymin)
      ymax = Math.max(p.y, ymax)
    }
  }

  // Normalize points to clip space
  for (let p of points) {
    p.x = renorm(p.x, xmin, xmax)
    p.y = renorm(p.y, ymin, ymax)
  }

  // render the wireframe
  for (let i = 0; i < points.length; i++) {
    // current point
    let a = points[i]

    // next point around the circle (wrapping)
    let b = points[(i + (V + 1)) % points.length]
    ctx.move(a.x, a.y)
    ctx.line(b.x, b.y)

    // next point along the curve (not wrapping)
    if ((i + 1) % (V + 1) != 0) {
      let b = points[i + 1]
      ctx.move(a.x, a.y)
      ctx.line(b.x, b.y)
    }
  }
}

function doubleyou(ctx, q, r, t, X, Y) {
  t = denorm((t + 1.5) % 1) // -1 to 1, phase shifted
  t = Math.sign(t) * Math.abs(t) ** 4 // -1 to 1, squished
  let J = declip(q, 0.05, 1) // how many wiggles
  let R = declip(r, 0.2, 2) // how tight are the wiggles
  let m = declip(t, 1, -2) * R // wiggle start
  let M = declip(t, 2, -1) * R // wiggle end
  for (let j = 0; j < 1; j += J) {
    ctx.begin()
    for (let x = m; x <= M; x += 0.01) {
      let frac = renorm(x, m, M, 0, 1)
      let y = -Math.cos((x * TAU * 2) / R) * 0.8 - declip(Math.cos(TAU * frac + PI)) * 0.4 * j + 0.2
      if (x < -1 || x > 1) continue
      ctx.line(x, y)
    }
  }
}
